import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EMPTY, Observable, Subscription, catchError, exhaustMap, finalize, switchMap, timer } from 'rxjs';
import { LocationMapComponent } from '../components/location-map.component';
import { Coordinate, DriverRideRequest, DriverTrip, DriverTripResponse } from '../models/api.models';
import { ApiService } from '../services/api.service';
import {
  DrivingRoute,
  LocationSearchService,
  locationServiceErrorMessage,
} from '../services/location-search.service';
import { apiErrorMessage } from '../utils/api-error';

@Component({
  selector: 'app-driver-page',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, DecimalPipe, FormsModule, LocationMapComponent],
  templateUrl: './driver-page.component.html',
  styleUrl: './driver-page.component.scss',
})
export class DriverPageComponent implements OnDestroy {
  available = false;
  requests: DriverRideRequest[] = [];
  activeTrip: DriverTrip | null = null;
  activeRequest: DriverRideRequest | null = null;
  actualDistanceKm = 0;
  actualDurationMin = 0;
  busy = false;
  pageError = '';
  notice = '';
  private requestPolling?: Subscription;
  private watchId: number | null = null;
  private locationPolling?: Subscription;
  private lastKnownCoordinate: Coordinate | null = null;
  private lastKnownSpeed: number | undefined;
  private currentHeading: number | undefined;
  private trackingErrorShown = false;
  private demoSubscription?: Subscription;
  demoRoute: DrivingRoute | null = null;
  demoRouteCoordinates: Coordinate[] = [];
  demoRoutePhase: 'pickup' | 'trip' | null = null;
  demoMode = false;
  demoRunning = false;
  demoProgress = 0;
  preparingDemoRoute = false;
  simulationLocation: Coordinate | null = null;
  lastRequestsUpdatedAt: Date | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly locations: LocationSearchService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

  ngOnDestroy(): void {
    if (this.demoMode && this.lastKnownCoordinate) {
      this.sendLocation(this.lastKnownCoordinate);
    }
    this.requestPolling?.unsubscribe();
    this.demoSubscription?.unsubscribe();
    this.stopTracking();
  }

  get mapDriverLocation(): Coordinate | null {
    return this.simulationLocation ?? this.lastKnownCoordinate;
  }

  setAvailability(): void {
    const nextStatus = this.available ? 'unavailable' : 'available';
    this.busy = true;
    this.pageError = '';
    this.api.driverAvailability(nextStatus).pipe(
      finalize(() => {
        this.busy = false;
        this.changeDetector.markForCheck();
      }),
    ).subscribe({
      next: (response) => {
        this.available = response.availability_status === 'available';
        this.notice = response.message;
        if (this.available) {
          this.beginRequestPolling();
          this.startTracking();
        } else {
          this.requestPolling?.unsubscribe();
          this.requests = [];
          this.stopDemoSimulation();
          this.stopTracking();
        }
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  acceptRequest(request: DriverRideRequest): void {
    this.busy = true;
    this.pageError = '';
    this.api.acceptRideRequest(request.id).pipe(
      finalize(() => {
        this.busy = false;
        this.changeDetector.markForCheck();
      }),
    ).subscribe({
      next: (response) => {
        this.activeTrip = response.trip;
        this.activeRequest = request;
        this.resetDemoRoute();
        this.requests = this.requests.filter((item) => item.id !== request.id);
        this.requestPolling?.unsubscribe();
        this.notice = response.message;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  arrive(): void {
    if (!this.activeTrip) {
      return;
    }
    this.performTripAction(() => this.api.driverArrive(this.activeTrip!.id));
  }

  startTrip(): void {
    if (!this.activeTrip) {
      return;
    }
    this.performTripAction(() => this.api.driverStart(this.activeTrip!.id));
  }

  preparePickupSimulation(): void {
    if (!this.activeRequest || !this.lastKnownCoordinate) {
      this.pageError = 'Espera a que el GPS del conductor determine tu ubicación antes de preparar la simulación.';
      return;
    }
    this.prepareDemoRoute(
      this.lastKnownCoordinate,
      { latitude: this.activeRequest.origin_latitude, longitude: this.activeRequest.origin_longitude },
      'pickup',
    );
  }

  prepareTripSimulation(): void {
    if (!this.activeRequest) {
      return;
    }
    this.prepareDemoRoute(
      { latitude: this.activeRequest.origin_latitude, longitude: this.activeRequest.origin_longitude },
      { latitude: this.activeRequest.destination_latitude, longitude: this.activeRequest.destination_longitude },
      'trip',
    );
  }

  startDemoSimulation(): void {
    if (!this.demoRoute || !this.demoRoutePhase || this.demoRoute.coordinates.length < 2) {
      this.pageError = 'Primero prepara una ruta para la simulación.';
      return;
    }
    const route = this.demoRoute;
    this.pageError = '';
    this.demoMode = true;
    this.demoRunning = true;
    this.demoProgress = 0;
    this.locationPolling?.unsubscribe();
    this.locationPolling = undefined;
    const startedAt = Date.now();
    this.demoSubscription?.unsubscribe();
    this.demoSubscription = timer(0, 5000).subscribe(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / 30000);
      this.demoProgress = progress;
      this.simulationLocation = this.coordinateAtProgress(route.coordinates, progress);
      this.sendLocation(this.simulationLocation);
      if (progress >= 1) {
        this.demoRunning = false;
        this.demoSubscription?.unsubscribe();
        this.notice = 'La simulación DEMO llegó al punto indicado. Confirma la llegada para continuar el flujo.';
      }
      if (progress >= 1 && this.demoRoutePhase === 'trip') {
        this.actualDistanceKm = route.distanceKm;
        this.actualDurationMin = Math.max(1, Math.ceil(route.durationMinutes));
      }
      this.changeDetector.markForCheck();
    });
  }

  stopDemoSimulation(): void {
    const wasDemoMode = this.demoMode;
    this.demoSubscription?.unsubscribe();
    this.demoSubscription = undefined;
    this.demoMode = false;
    this.demoRunning = false;
    this.demoProgress = 0;
    this.simulationLocation = null;
    this.resetDemoRoute();
    if (wasDemoMode && this.available && this.lastKnownCoordinate) {
      this.sendLocation(this.lastKnownCoordinate);
      this.beginLocationPolling(5000);
    }
    this.changeDetector.markForCheck();
  }

  completeTrip(): void {
    if (!this.activeTrip) {
      return;
    }
    if (this.actualDistanceKm <= 0 || this.actualDurationMin <= 0) {
      this.pageError = 'Ingresa una distancia y duración mayores que cero.';
      return;
    }
    this.busy = true;
    this.pageError = '';
    this.api.driverComplete(this.activeTrip.id, this.actualDistanceKm, this.actualDurationMin).pipe(
      finalize(() => {
        this.busy = false;
        this.changeDetector.markForCheck();
      }),
    ).subscribe({
      next: (response) => {
        this.notice = `${response.message} Tarifa final: ${response.trip.final_fare ?? response.trip.estimated_fare}.`;
        this.activeTrip = null;
        this.activeRequest = null;
        this.stopDemoSimulation();
        this.actualDistanceKm = 0;
        this.actualDurationMin = 0;
        if (this.available) {
          this.beginRequestPolling();
        }
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  useCurrentLocation(coordinate: Coordinate): void {
    if (!this.available) {
      this.pageError = 'La ubicación se centra en el mapa, pero solo se envía al servidor mientras estás conectado.';
      this.changeDetector.markForCheck();
      return;
    }
    this.sendLocation(coordinate);
  }

  recordHeading(heading: number): void {
    this.currentHeading = heading;
  }

  private beginRequestPolling(): void {
    this.requestPolling?.unsubscribe();
    this.requestPolling = timer(0, 3000).pipe(
      exhaustMap(() => this.api.driverRequests().pipe(
        catchError((error: unknown) => {
          this.pageError = apiErrorMessage(error);
          this.changeDetector.markForCheck();
          return EMPTY;
        }),
      )),
    ).subscribe({
      next: (response) => {
        this.requests = response.requests;
        this.lastRequestsUpdatedAt = new Date();
        this.changeDetector.markForCheck();
      },
    });
  }

  private performTripAction(action: () => Observable<DriverTripResponse>): void {
    this.busy = true;
    this.pageError = '';
    action().pipe(finalize(() => {
      this.busy = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: (response) => {
        this.activeTrip = response.trip;
        if (response.trip.status === 'in_progress' && this.demoMode) {
          this.demoSubscription?.unsubscribe();
          this.demoMode = false;
          this.demoRunning = false;
          this.simulationLocation = null;
          this.resetDemoRoute();
          if (this.lastKnownCoordinate) {
            this.sendLocation(this.lastKnownCoordinate);
            this.beginLocationPolling(5000);
          }
        }
        this.notice = response.message;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  private startTracking(): void {
    if (!navigator.geolocation) {
      this.pageError = 'Este navegador no ofrece geolocalización; no se enviará tu ubicación al servidor.';
      return;
    }
    if (this.watchId !== null) {
      return;
    }
    this.trackingErrorShown = false;
    this.lastKnownCoordinate = null;
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.lastKnownCoordinate = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        this.currentHeading = position.coords.heading ?? this.currentHeading;
        this.lastKnownSpeed = position.coords.speed ?? undefined;
        this.changeDetector.markForCheck();
      },
      (error) => {
        if (!this.trackingErrorShown) {
          this.pageError = error.code === error.PERMISSION_DENIED
            ? 'Permite la ubicación para compartir tu posición mientras estás disponible.'
            : 'No fue posible obtener la ubicación del conductor.';
          this.trackingErrorShown = true;
          this.changeDetector.markForCheck();
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    this.beginLocationPolling();
  }

  private beginLocationPolling(initialDelayMs = 0): void {
    this.locationPolling?.unsubscribe();
    this.locationPolling = timer(initialDelayMs, 5000).pipe(
      exhaustMap(() => {
        if (!this.lastKnownCoordinate || this.demoMode) {
          return EMPTY;
        }
        return this.api.driverLocation({
          ...this.lastKnownCoordinate,
          ...(this.currentHeading !== undefined ? { heading: this.currentHeading } : {}),
          ...(this.lastKnownSpeed !== undefined ? { speed: this.lastKnownSpeed } : {}),
          ...(this.activeTrip ? { trip_id: this.activeTrip.id } : {}),
        }).pipe(
          catchError((error: unknown) => {
            this.pageError = apiErrorMessage(error);
            this.changeDetector.markForCheck();
            return EMPTY;
          }),
        );
      }),
    ).subscribe();
  }

  private stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.locationPolling?.unsubscribe();
    this.locationPolling = undefined;
    this.lastKnownCoordinate = null;
  }

  private sendLocation(coordinate: Coordinate, heading?: number, speed?: number): void {
    if (!this.demoMode) {
      this.lastKnownCoordinate = coordinate;
    }
    this.api.driverLocation({
      ...coordinate,
      ...(heading ?? this.currentHeading) !== undefined ? { heading: heading ?? this.currentHeading } : {},
      ...(speed ?? this.lastKnownSpeed) !== undefined ? { speed: speed ?? this.lastKnownSpeed } : {},
      ...(this.activeTrip ? { trip_id: this.activeTrip.id } : {}),
    }).subscribe({
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  private prepareDemoRoute(origin: Coordinate, destination: Coordinate, phase: 'pickup' | 'trip'): void {
    this.preparingDemoRoute = true;
    this.pageError = '';
    this.locations.drivingRoute(origin, destination).pipe(
      finalize(() => {
        this.preparingDemoRoute = false;
        this.changeDetector.markForCheck();
      }),
    ).subscribe({
      next: (route) => {
        this.demoRoute = route;
        this.demoRouteCoordinates = route.coordinates;
        this.demoRoutePhase = phase;
        this.simulationLocation = null;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = `No se pudo preparar la ruta de demostración: ${locationServiceErrorMessage(error)}`;
        this.changeDetector.markForCheck();
      },
    });
  }

  private coordinateAtProgress(route: Coordinate[], progress: number): Coordinate {
    const position = progress * (route.length - 1);
    const index = Math.min(Math.floor(position), route.length - 2);
    const segmentProgress = progress >= 1 ? 1 : position - index;
    const start = route[index];
    const end = route[index + 1];
    return {
      latitude: start.latitude + (end.latitude - start.latitude) * segmentProgress,
      longitude: start.longitude + (end.longitude - start.longitude) * segmentProgress,
    };
  }

  private resetDemoRoute(): void {
    this.demoRoute = null;
    this.demoRouteCoordinates = [];
    this.demoRoutePhase = null;
    this.demoProgress = 0;
    this.simulationLocation = null;
  }
}
