import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ActiveRideResponse,
  AdminDashboardResponse,
  AdminDriversResponse,
  AdminFaresResponse,
  AdminTripsResponse,
  ApiResponse,
  AuthResponse,
  AvailabilityResponse,
  Coordinate,
  DriverRequestsResponse,
  DriverTripResponse,
  EstimateResponse,
  FareResponse,
  RideRequestResponse,
  TripsResponse,
  UserResponse,
} from '../models/api.models';

export interface RegisterClientRequest {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: 'client';
}

export interface RegisterDriverRequest extends Omit<RegisterClientRequest, 'role'> {
  role: 'driver';
  license_number: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  capacity: number;
  color: string;
}

export interface RideCreateRequest {
  origin_name: string;
  origin_latitude: number;
  origin_longitude: number;
  destination_name: string;
  destination_latitude: number;
  destination_longitude: number;
}

export interface DriverLocationRequest extends Coordinate {
  heading?: number;
  speed?: number;
  trip_id?: number;
}

export interface FareCreateRequest {
  name: string;
  base_fare: number;
  price_per_km: number;
  price_per_minute: number;
  minimum_fare: number;
  surge_multiplier: number;
  active: boolean;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  login(login: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/login`, { login, password });
  }

  register(payload: RegisterClientRequest | RegisterDriverRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/register`, payload);
  }

  me(): Observable<UserResponse> {
    return this.http.get<UserResponse>(`${this.baseUrl}/auth/me`);
  }

  logout(): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(`${this.baseUrl}/auth/logout`, {});
  }

  activeFare(): Observable<FareResponse> {
    return this.http.get<FareResponse>(`${this.baseUrl}/fares/active`);
  }

  estimateFare(origin: Coordinate, destination: Coordinate): Observable<EstimateResponse> {
    return this.http.post<EstimateResponse>(`${this.baseUrl}/client/estimate-fare`, {
      origin_latitude: origin.latitude,
      origin_longitude: origin.longitude,
      destination_latitude: destination.latitude,
      destination_longitude: destination.longitude,
    });
  }

  createRide(payload: RideCreateRequest): Observable<RideRequestResponse> {
    return this.http.post<RideRequestResponse>(`${this.baseUrl}/client/ride-requests`, payload);
  }

  clientActiveRide(): Observable<ActiveRideResponse> {
    return this.http.get<ActiveRideResponse>(`${this.baseUrl}/client/active`);
  }

  cancelRide(id: number, reason: string): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(`${this.baseUrl}/client/cancel/${id}`, { reason });
  }

  clientTrips(page = 1): Observable<TripsResponse> {
    return this.http.get<TripsResponse>(`${this.baseUrl}/client/trips`, {
      params: new HttpParams().set('page', page),
    });
  }

  rateTrip(id: number, score: number, comment: string, hasIncident: boolean): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.baseUrl}/client/trips/${id}/rating`, {
      score,
      comment,
      has_incident: hasIncident,
    });
  }

  driverAvailability(status: 'available' | 'unavailable'): Observable<AvailabilityResponse> {
    return this.http.put<AvailabilityResponse>(`${this.baseUrl}/driver/availability`, { status });
  }

  driverRequests(): Observable<DriverRequestsResponse> {
    return this.http.get<DriverRequestsResponse>(`${this.baseUrl}/driver/ride-requests`);
  }

  acceptRideRequest(id: number): Observable<DriverTripResponse> {
    return this.http.post<DriverTripResponse>(`${this.baseUrl}/driver/ride-requests/${id}/accept`, {});
  }

  driverArrive(id: number): Observable<DriverTripResponse> {
    return this.http.post<DriverTripResponse>(`${this.baseUrl}/driver/trips/${id}/arrive`, {});
  }

  driverStart(id: number): Observable<DriverTripResponse> {
    return this.http.post<DriverTripResponse>(`${this.baseUrl}/driver/trips/${id}/start`, {});
  }

  driverComplete(id: number, distanceKm: number, durationMin: number): Observable<DriverTripResponse> {
    return this.http.post<DriverTripResponse>(`${this.baseUrl}/driver/trips/${id}/complete`, {
      actual_distance_km: distanceKm,
      actual_duration_min: durationMin,
    });
  }

  driverLocation(payload: DriverLocationRequest): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.baseUrl}/driver/location`, payload);
  }

  adminDashboard(): Observable<AdminDashboardResponse> {
    return this.http.get<AdminDashboardResponse>(`${this.baseUrl}/admin/dashboard`);
  }

  adminDrivers(approvalStatus = ''): Observable<AdminDriversResponse> {
    let params = new HttpParams();
    if (approvalStatus) {
      params = params.set('approval_status', approvalStatus);
    }
    return this.http.get<AdminDriversResponse>(`${this.baseUrl}/admin/drivers`, { params });
  }

  updateDriverApproval(id: number, approvalStatus: string, notes: string): Observable<ApiResponse<unknown>> {
    return this.http.patch<ApiResponse<unknown>>(`${this.baseUrl}/admin/drivers/${id}/approval`, {
      approval_status: approvalStatus,
      admin_notes: notes,
    });
  }

  adminFares(): Observable<AdminFaresResponse> {
    return this.http.get<AdminFaresResponse>(`${this.baseUrl}/admin/fares`);
  }

  createFare(payload: FareCreateRequest): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.baseUrl}/admin/fares`, payload);
  }

  adminTrips(filters: Record<string, string>): Observable<AdminTripsResponse> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(key, value);
      }
    }
    return this.http.get<AdminTripsResponse>(`${this.baseUrl}/admin/trips`, { params });
  }

  adminReports(): Observable<ApiResponse<unknown>> {
    return this.http.get<ApiResponse<unknown>>(`${this.baseUrl}/admin/reports`);
  }

  adminAuditLogs(): Observable<ApiResponse<unknown>> {
    return this.http.get<ApiResponse<unknown>>(`${this.baseUrl}/admin/audit-logs`);
  }
}
