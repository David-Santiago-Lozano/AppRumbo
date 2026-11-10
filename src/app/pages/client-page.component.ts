import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EMPTY, BehaviorSubject, Subscription, catchError, distinctUntilChanged, exhaustMap, finalize, switchMap, timer } from 'rxjs';
import { LocationMapComponent } from '../components/location-map.component';
import {
  ActiveRideResponse,
  ClientRideStatus,
  Coordinate,
  Fare,
  FareEstimate,
  Trip,
} from '../models/api.models';
import { ApiService } from '../services/api.service';
import {
  DrivingRoute,
  LocationSearchService,
  locationServiceErrorMessage,
  PlaceSearchResult,
} from '../services/location-search.service';
import { apiErrorMessage } from '../utils/api-error';

type LocationTarget = 'origin' | 'destination';

@Component({
  selector: 'app-client-page',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, DecimalPipe, FormsModule, LocationMapComponent],
  templateUrl: './client-page.component.html',
  styleUrl: './client-page.component.scss',
})
export class ClientPageComponent implements OnInit, OnDestroy {
  originName = '';
  destinationName = '';
  origin: Coordinate | null = null;
  destination: Coordinate | null = null;
  target: LocationTarget = 'origin';
  fare: Fare | null = null;
  estimate: FareEstimate | null = null;
  activeRide: ClientRideStatus | null = null;
  driverLocation: Coordinate | null = null;
  routeCoordinates: Coordinate[] = [];
  roadRoute: DrivingRoute | null = null;
  placeResults: PlaceSearchResult[] = [];
  placeSearchTarget: LocationTarget | null = null;
  searchingPlaces = false;
  routeBusy = false;
  lastLiveUpdateAt: Date | null = null;
  trips: Trip[] = [];
  selectedRatingTrip: number | null = null;
  ratingScore = 5;
  ratingComment = '';
  hasIncident = false;
  busy = false;
  estimateBusy = false;
  fareError = '';
  pageError = '';
  notice = '';
  private estimateSubscription?: Subscription;
  private routeSubscription?: Subscription;
  private placeSearchSubscription?: Subscription;
  private routeKey = '';
  private destroyed = false;
  private readonly activePollInterval = new BehaviorSubject(15000);
  private activePollingSubscription?: Subscription;

  constructor(
    private readonly api: ApiService,
    private readonly locations: LocationSearchService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadFare();
    this.loadTrips();
    this.activePollingSubscription = this.activePollInterval.pipe(
      distinctUntilChanged(),
      switchMap((intervalMs) => timer(0, intervalMs).pipe(
        exhaustMap(() => this.api.clientActiveRide().pipe(
          catchError((error: unknown) => {
            this.pageError = apiErrorMessage(error);
            this.changeDetector.markForCheck();
            return EMPTY;
          }),
        )),
      )),
    ).subscribe({ next: (response) => this.setActiveRide(response) });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.estimateSubscription?.unsubscribe();
    this.routeSubscription?.unsubscribe();
    this.placeSearchSubscription?.unsubscribe();
    this.activePollingSubscription?.unsubscribe();
  }

  setTarget(target: LocationTarget): void {
    this.target = target;
  }

  selectLocation(coordinate: Coordinate): void {
    this.placeResults = [];
    this.placeSearchTarget = null;
    if (this.target === 'origin') {
      this.origin = coordinate;
      this.originName = 'Punto de recogida seleccionado en el mapa';
    } else {
      this.destination = coordinate;
      this.destinationName = 'Destino seleccionado en el mapa';
    }
    this.loadDrivingRoute();
  }

  useCurrentLocation(coordinate: Coordinate): void {
    this.origin = coordinate;
    this.originName = 'Mi ubicación actual';
    this.target = 'destination';
    this.estimateRoute();
  }

  onPlaceNameChanged(target: LocationTarget): void {
    this.placeSearchSubscription?.unsubscribe();
    if (target === 'origin') {
      this.origin = null;
    } else {
      this.destination = null;
    }
    this.placeResults = [];
    this.placeSearchTarget = null;
    this.roadRoute = null;
    this.routeCoordinates = [];
    this.routeKey = '';
    this.estimate = null;
  }

  searchPlace(target: LocationTarget): void {
    const query = (target === 'origin' ? this.originName : this.destinationName).trim();
    if (!query) {
      this.pageError = 'Escribe una dirección o lugar para buscarlo.';
      return;
    }
    this.placeSearchSubscription?.unsubscribe();
    this.searchingPlaces = true;
    this.placeResults = [];
    this.placeSearchTarget = target;
    this.pageError = '';
    this.placeSearchSubscription = this.locations.searchPlaces(query).pipe(
      finalize(() => {
        this.searchingPlaces = false;
        this.changeDetector.markForCheck();
      }),
    ).subscribe({
      next: (results) => {
        this.placeResults = results;
        if (results.length === 0) {
          this.pageError = 'No se encontraron lugares en Colombia. Prueba con una dirección o municipio más específico.';
        }
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = `No se pudo buscar el lugar: ${locationServiceErrorMessage(error)}`;
        this.changeDetector.markForCheck();
      },
    });
  }

  selectPlace(place: PlaceSearchResult): void {
    if (this.placeSearchTarget === 'origin') {
      this.origin = { latitude: place.latitude, longitude: place.longitude };
      this.originName = place.displayName;
    } else if (this.placeSearchTarget === 'destination') {
      this.destination = { latitude: place.latitude, longitude: place.longitude };
      this.destinationName = place.displayName;
    } else {
      return;
    }
    this.placeResults = [];
    this.placeSearchTarget = null;
    this.pageError = '';
    this.estimate = null;
    this.loadDrivingRoute();
    if (!this.destroyed && this.origin && this.destination) {
      this.estimateRoute();
    }
  }

  estimateRoute(): void {
    this.pageError = '';
    this.estimate = null;
    this.estimateSubscription?.unsubscribe();
    if (!this.origin || !this.destination) {
      return;
    }
    this.loadDrivingRoute();
    this.estimateBusy = true;
    this.estimateSubscription = this.api.estimateFare(this.origin, this.destination).pipe(
      finalize(() => {
        this.estimateBusy = false;
        this.changeDetector.markForCheck();
      }),
    ).subscribe({
      next: (response) => {
        this.estimate = response.estimate;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  requestRide(): void {
    if (!this.origin || !this.destination || !this.originName.trim() || !this.destinationName.trim()) {
      this.pageError = 'Escribe los nombres y selecciona en el mapa el origen y el destino.';
      return;
    }
    this.pageError = '';
    this.notice = '';
    this.busy = true;
    this.api.createRide({
      origin_name: this.originName.trim(),
      origin_latitude: this.origin.latitude,
      origin_longitude: this.origin.longitude,
      destination_name: this.destinationName.trim(),
      destination_latitude: this.destination.latitude,
      destination_longitude: this.destination.longitude,
    }).pipe(finalize(() => {
      this.busy = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: (response) => {
        this.notice = response.message;
        this.setActiveRide({
          success: true,
          has_active: true,
          type: 'request',
          data: response.ride_request,
        });
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  cancelRide(): void {
    if (!this.activeRide) {
      return;
    }
    const reason = window.prompt('Motivo de cancelación', 'Cambio de planes del usuario');
    if (reason === null) {
      return;
    }
    this.busy = true;
    this.pageError = '';
    this.api.cancelRide(this.activeRide.id, reason.trim()).pipe(
      finalize(() => {
        this.busy = false;
        this.changeDetector.markForCheck();
      }),
    ).subscribe({
      next: (response) => {
        this.notice = response.message ?? 'Viaje cancelado.';
        this.activeRide = null;
        this.estimate = null;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  loadTrips(): void {
    this.api.clientTrips().subscribe({
      next: (response) => {
        this.trips = response.trips.data;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  rateTrip(): void {
    if (this.selectedRatingTrip === null) {
      return;
    }
    this.busy = true;
    this.pageError = '';
    this.api.rateTrip(this.selectedRatingTrip, this.ratingScore, this.ratingComment.trim(), this.hasIncident).pipe(
      finalize(() => {
        this.busy = false;
        this.changeDetector.markForCheck();
      }),
    ).subscribe({
      next: (response) => {
        this.notice = response.message ?? 'Calificación enviada.';
        this.selectedRatingTrip = null;
        this.ratingComment = '';
        this.hasIncident = false;
        this.loadTrips();
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  refreshActive(): void {
    this.api.clientActiveRide().subscribe({
      next: (response) => this.setActiveRide(response),
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  private loadFare(): void {
    this.api.activeFare().subscribe({
      next: (response) => {
        this.fare = response.fare;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.fareError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  private loadDrivingRoute(): void {
    if (!this.origin || !this.destination) {
      return;
    }
    const origin = this.origin;
    const destination = this.destination;
    const key = `${origin.latitude},${origin.longitude};${destination.latitude},${destination.longitude}`;
    if (this.routeKey === key) {
      return;
    }
    if (this.routeBusy) {
      return;
    }
    this.routeSubscription?.unsubscribe();
    this.routeBusy = true;
    this.routeSubscription = this.locations.drivingRoute(origin, destination).pipe(
      finalize(() => {
        this.routeBusy = false;
        this.changeDetector.markForCheck();
        if (this.origin && this.destination) {
          const currentKey = `${this.origin.latitude},${this.origin.longitude};${this.destination.latitude},${this.destination.longitude}`;
          if (currentKey !== key) {
            this.loadDrivingRoute();
          }
        }
      }),
    ).subscribe({
      next: (route) => {
        const currentKey = this.origin && this.destination
          ? `${this.origin.latitude},${this.origin.longitude};${this.destination.latitude},${this.destination.longitude}`
          : '';
        if (currentKey !== key) {
          return;
        }
        this.routeKey = key;
        this.routeCoordinates = route.coordinates;
        this.roadRoute = route;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.routeKey = '';
        this.roadRoute = null;
        this.routeCoordinates = [];
        const detail = locationServiceErrorMessage(error);
        this.pageError = `No se pudo calcular la ruta por carretera: ${detail}`;
        this.changeDetector.markForCheck();
      },
    });
  }

  private setActiveRide(response: ActiveRideResponse): void {
    this.activeRide = response.has_active ? response.data ?? null : null;
    this.driverLocation = this.activeRide?.driver?.latest_location ?? null;
    if (this.activeRide?.origin_latitude !== undefined && this.activeRide.origin_longitude !== undefined) {
      this.origin = {
        latitude: this.activeRide.origin_latitude,
        longitude: this.activeRide.origin_longitude,
      };
    }
    if (this.activeRide?.destination_latitude !== undefined && this.activeRide.destination_longitude !== undefined) {
      this.destination = {
        latitude: this.activeRide.destination_latitude,
        longitude: this.activeRide.destination_longitude,
      };
    }
    if (this.activeRide?.origin_name) {
      this.originName = this.activeRide.origin_name;
    }
    if (this.activeRide?.destination_name) {
      this.destinationName = this.activeRide.destination_name;
    }
    if (this.activeRide && this.origin && this.destination) {
      this.loadDrivingRoute();
    }
    this.lastLiveUpdateAt = new Date();
    this.activePollInterval.next(this.activeRide ? 3000 : 15000);
    this.changeDetector.markForCheck();
  }
}
