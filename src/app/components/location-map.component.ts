import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import type * as Leaflet from 'leaflet';
import { Coordinate } from '../models/api.models';

type LocationTarget = 'origin' | 'destination';
type OrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};
interface CompassEvent extends DeviceOrientationEvent {
  readonly webkitCompassHeading?: number;
}

declare global {
  interface Window {
    L: typeof import('leaflet');
  }
}

@Component({
  selector: 'app-location-map',
  standalone: true,
  template: `
    <div #mapElement class="location-map" role="application" aria-label="Mapa interactivo de OpenStreetMap"></div>
    <div class="map-actions">
      @if (selectable) {
        <div class="map-target" aria-live="polite">
          Toca el mapa para elegir {{ target === 'origin' ? 'el origen' : 'el destino' }}
        </div>
      }
      <button type="button" class="map-action" (click)="locateMe()" [disabled]="locating" aria-label="Usar mi ubicación">
        {{ locating ? 'Buscando…' : 'Mi ubicación' }}
      </button>
      <button type="button" class="map-action" [class.enabled]="compassEnabled" (click)="toggleCompass()" [attr.aria-pressed]="compassEnabled">
        {{ compassEnabled ? 'Desactivar brújula' : 'Activar giroscopio' }}
      </button>
      @if (mapMessage) {
        <p class="map-message" role="status">{{ mapMessage }}</p>
      }
    </div>
    <div class="map-credit">© OpenStreetMap contributors</div>
  `,
  styleUrl: './location-map.component.scss',
})
export class LocationMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapElement', { static: true }) mapElement!: ElementRef<HTMLDivElement>;
  @Input() origin: Coordinate | null = null;
  @Input() destination: Coordinate | null = null;
  @Input() driverLocation: Coordinate | null = null;
  @Input() routeCoordinates: Coordinate[] = [];
  @Input() target: LocationTarget = 'origin';
  @Input() selectable = true;
  @Output() locationSelected = new EventEmitter<Coordinate>();
  @Output() currentLocationFound = new EventEmitter<Coordinate>();
  @Output() headingChanged = new EventEmitter<number>();

  locating = false;
  compassEnabled = false;
  mapMessage = '';

  private map: Leaflet.Map | null = null;
  private markers: Leaflet.LayerGroup | null = null;
  private routeLine: Leaflet.Polyline | null = null;
  private driverMarker: Leaflet.Marker | null = null;
  private driverAnimationFrame = 0;
  private messageTimeout = 0;
  private readonly onMapClick = (event: Leaflet.LeafletMouseEvent): void => {
    if (this.selectable) {
      this.locationSelected.emit({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    }
  };
  private readonly onDeviceOrientation = (event: DeviceOrientationEvent): void => {
    const compassEvent = event as CompassEvent;
    const alphaHeading = event.alpha === null ? null : (360 - event.alpha) % 360;
    const heading = compassEvent.webkitCompassHeading ?? alphaHeading;
    if (heading === null || !Number.isFinite(heading) || !this.map) {
      return;
    }
    this.map.setBearing(heading);
    this.headingChanged.emit(heading);
  };

  constructor(private readonly changeDetector: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    const leaflet = window.L;
    if (!leaflet) {
      this.showMessage('No se pudo cargar el mapa. Recarga la página para intentarlo de nuevo.');
      return;
    }

    this.map = leaflet.map(this.mapElement.nativeElement, {
      center: [4.6533, -74.0836],
      zoom: 12,
      rotate: true,
      touchRotate: true,
      rotateControl: true,
      zoomControl: true,
    });
    leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);
    this.markers = leaflet.layerGroup().addTo(this.map);
    this.map.on('click', this.onMapClick);
    this.renderLocations();
    window.setTimeout(() => this.map?.invalidateSize(), 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['origin'] || changes['destination'] || changes['routeCoordinates']) {
      this.renderLocations();
    }
    if (changes['driverLocation']) {
      this.renderDriverLocation();
    }
  }

  ngOnDestroy(): void {
    window.clearTimeout(this.messageTimeout);
    window.cancelAnimationFrame(this.driverAnimationFrame);
    if (this.compassEnabled) {
      window.removeEventListener('deviceorientation', this.onDeviceOrientation);
    }
    this.map?.off('click', this.onMapClick);
    this.map?.remove();
  }

  locateMe(): void {
    if (!navigator.geolocation) {
      this.showMessage('Este navegador no ofrece acceso a la ubicación.');
      return;
    }
    this.locating = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.locating = false;
        const coordinate = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        this.currentLocationFound.emit(coordinate);
        this.map?.setView([coordinate.latitude, coordinate.longitude], 16);
        this.changeDetector.markForCheck();
      },
      (error) => {
        this.locating = false;
        this.showMessage(error.code === error.PERMISSION_DENIED
          ? 'Permite el acceso a tu ubicación en los ajustes del navegador.'
          : 'No fue posible obtener tu ubicación. Inténtalo de nuevo.');
        this.changeDetector.markForCheck();
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 },
    );
  }

  async toggleCompass(): Promise<void> {
    if (this.compassEnabled) {
      this.compassEnabled = false;
      window.removeEventListener('deviceorientation', this.onDeviceOrientation);
      this.map?.setBearing(0);
      return;
    }
    if (!window.isSecureContext) {
      this.showMessage('El giroscopio requiere HTTPS cuando abres la app desde tu celular.');
      return;
    }
    if (!('DeviceOrientationEvent' in window)) {
      this.showMessage('Este dispositivo no ofrece sensor de orientación.');
      return;
    }

    try {
      const orientation = DeviceOrientationEvent as OrientationConstructor;
      if (orientation.requestPermission) {
        const permission = await orientation.requestPermission();
        if (permission !== 'granted') {
          this.showMessage('No se concedió permiso para usar el giroscopio.');
          return;
        }
      }
      window.addEventListener('deviceorientation', this.onDeviceOrientation);
      this.compassEnabled = true;
      this.showMessage('Giroscopio activo: gira el mapa según la orientación del dispositivo.');
      this.changeDetector.markForCheck();
    } catch {
      this.showMessage('No se pudo activar el giroscopio. Revisa los permisos del navegador.');
      this.changeDetector.markForCheck();
    }
  }

  private renderLocations(): void {
    if (!this.map || !this.markers) {
      return;
    }
    const leaflet = window.L;
    this.markers.clearLayers();
    this.routeLine?.remove();

    const routePoints: Leaflet.LatLng[] = this.routeCoordinates.map((coordinate) =>
      leaflet.latLng(coordinate.latitude, coordinate.longitude),
    );
    const points: Leaflet.LatLng[] = [];
    if (this.origin) {
      const point: [number, number] = [this.origin.latitude, this.origin.longitude];
      points.push(leaflet.latLng(point));
      leaflet.marker(point, {
        icon: leaflet.divIcon({
          className: 'rumbo-marker rumbo-marker-origin',
          html: '<span>O</span>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        title: 'Punto de recogida',
      }).addTo(this.markers);
    }
    if (this.destination) {
      const point: [number, number] = [this.destination.latitude, this.destination.longitude];
      points.push(leaflet.latLng(point));
      leaflet.marker(point, {
        icon: leaflet.divIcon({
          className: 'rumbo-marker rumbo-marker-destination',
          html: '<span>D</span>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        title: 'Destino',
      }).addTo(this.markers);
    }
    if (routePoints.length < 2 && this.origin && this.destination) {
      routePoints.push(
        leaflet.latLng(this.origin.latitude, this.origin.longitude),
        leaflet.latLng(this.destination.latitude, this.destination.longitude),
      );
    }
    if (routePoints.length > 1) {
      this.routeLine = leaflet.polyline(routePoints, { color: '#365f43', weight: 5, opacity: 0.8 }).addTo(this.map);
      this.map.fitBounds(this.routeLine.getBounds(), { padding: [40, 40], maxZoom: 15 });
    } else if (points.length === 1) {
      this.map.setView(points[0], 15);
    }
    this.renderDriverLocation();
  }

  private renderDriverLocation(): void {
    if (!this.map || !this.markers) {
      return;
    }
    if (!this.driverLocation) {
      window.cancelAnimationFrame(this.driverAnimationFrame);
      this.driverMarker?.remove();
      this.driverMarker = null;
      return;
    }
    const target = window.L.latLng(this.driverLocation.latitude, this.driverLocation.longitude);
    if (!this.driverMarker) {
      this.driverMarker = window.L.marker(target, {
        icon: window.L.divIcon({
          className: 'rumbo-marker rumbo-marker-driver',
          html: '<span>C</span>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        title: 'Ubicación del conductor',
      }).addTo(this.markers);
      return;
    }

    if (!this.markers.hasLayer(this.driverMarker)) {
      this.markers.addLayer(this.driverMarker);
    }
    const start = this.driverMarker.getLatLng();
    window.cancelAnimationFrame(this.driverAnimationFrame);
    const startedAt = performance.now();
    const animate = (now: number): void => {
      const progress = Math.min(1, (now - startedAt) / 2500);
      this.driverMarker?.setLatLng([
        start.lat + (target.lat - start.lat) * progress,
        start.lng + (target.lng - start.lng) * progress,
      ]);
      if (progress < 1) {
        this.driverAnimationFrame = window.requestAnimationFrame(animate);
      }
    };
    this.driverAnimationFrame = window.requestAnimationFrame(animate);
  }

  private showMessage(message: string): void {
    this.mapMessage = message;
    this.changeDetector.markForCheck();
    window.clearTimeout(this.messageTimeout);
    this.messageTimeout = window.setTimeout(() => {
      this.mapMessage = '';
      this.changeDetector.markForCheck();
    }, 5500);
  }
}
