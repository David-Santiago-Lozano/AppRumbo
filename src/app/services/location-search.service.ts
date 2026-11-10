import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map, switchMap, timer } from 'rxjs';
import { Coordinate } from '../models/api.models';

export interface PlaceSearchResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

export interface DrivingRoute {
  coordinates: Coordinate[];
  distanceKm: number;
  durationMinutes: number;
}

export function locationServiceErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return error.status === 0
      ? 'No se pudo conectar con el servicio de mapas. Verifica tu conexión a Internet.'
      : `El servicio de mapas respondió con el código ${error.status}.`;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Ocurrió un error al consultar el servicio de mapas.';
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

interface OsrmRouteResponse {
  code: string;
  routes?: {
    distance: number;
    duration: number;
    geometry: {
      coordinates: [number, number][];
    };
  }[];
}

@Injectable({ providedIn: 'root' })
export class LocationSearchService {
  private lastSearchStartedAt = 0;

  constructor(private readonly http: HttpClient) {}

  searchPlaces(query: string): Observable<PlaceSearchResult[]> {
    const waitMs = Math.max(0, 1000 - (Date.now() - this.lastSearchStartedAt));
    const params = new HttpParams()
      .set('q', query)
      .set('format', 'jsonv2')
      .set('limit', 5)
      .set('countrycodes', 'co')
      .set('accept-language', 'es');

    return timer(waitMs).pipe(
      switchMap(() => {
        this.lastSearchStartedAt = Date.now();
        return this.http.get<NominatimResult[]>('https://nominatim.openstreetmap.org/search', { params });
      }),
      map((results) => results.flatMap((result) => {
        const latitude = Number(result.lat);
        const longitude = Number(result.lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !result.display_name) {
          return [];
        }
        return [{ latitude, longitude, displayName: result.display_name }];
      })),
    );
  }

  drivingRoute(origin: Coordinate, destination: Coordinate): Observable<DrivingRoute> {
    const url = [
      'https://router.project-osrm.org/route/v1/driving',
      `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`,
    ].join('/');
    const params = new HttpParams()
      .set('overview', 'full')
      .set('geometries', 'geojson')
      .set('steps', 'false');

    return this.http.get<OsrmRouteResponse>(url, { params }).pipe(
      map((response) => {
        const route = response.routes?.[0];
        if (response.code !== 'Ok' || !route || route.geometry.coordinates.length < 2) {
          throw new Error('No se encontró una ruta en auto entre esos puntos.');
        }
        return {
          coordinates: route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
          distanceKm: route.distance / 1000,
          durationMinutes: route.duration / 60,
        };
      }),
    );
  }
}
