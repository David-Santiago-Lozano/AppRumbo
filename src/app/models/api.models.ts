export type UserRole = 'client' | 'driver' | 'admin';

export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface UserResponse {
  success: boolean;
  user: User;
}

export interface Fare {
  id: number;
  name: string;
  base_fare: number;
  price_per_km: number;
  price_per_minute: number;
  minimum_fare: number;
  surge_multiplier: number;
  active: boolean;
}

export interface FareResponse {
  success: boolean;
  fare: Fare;
}

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface FareEstimate {
  distance_km: number;
  duration_min: number;
  estimated_fare: number;
  currency: string;
  fare_breakdown: Omit<Fare, 'id' | 'name' | 'active'>;
}

export interface EstimateResponse {
  success: boolean;
  estimate: FareEstimate;
}

export interface RideRequest {
  id: number;
  origin_name: string;
  origin_latitude: number;
  origin_longitude: number;
  destination_name: string;
  destination_latitude: number;
  destination_longitude: number;
  estimated_distance_km: number;
  estimated_duration_min: number;
  estimated_fare: number;
  status: string;
  created_at?: string;
}

export interface RideRequestResponse {
  success: boolean;
  message: string;
  ride_request: RideRequest;
}

export interface Vehicle {
  plate: string;
  brand: string;
  model: string;
  year?: number;
  color?: string;
}

export interface DriverSummary {
  id: number;
  rating_average?: number;
  user: Pick<User, 'name' | 'phone'>;
  latest_location?: Coordinate;
}

export interface ClientRideStatus {
  id: number;
  status: string;
  estimated_fare: number;
  origin_name?: string;
  origin_latitude?: number;
  origin_longitude?: number;
  destination_name?: string;
  destination_latitude?: number;
  destination_longitude?: number;
  driver?: DriverSummary;
  vehicle?: Vehicle;
}

export interface ActiveRideResponse {
  success: boolean;
  has_active: boolean;
  type?: 'request' | 'trip';
  data?: ClientRideStatus;
}

export interface Trip {
  id: number;
  status: string;
  final_fare?: number;
  estimated_fare?: number;
  completed_at?: string;
  driver?: { user?: Pick<User, 'name'> };
  vehicle?: Pick<Vehicle, 'plate'>;
  origin_name?: string;
  destination_name?: string;
}

export interface PaginatedTrips {
  data: Trip[];
  current_page?: number;
  last_page?: number;
}

export interface TripsResponse {
  success: boolean;
  trips: PaginatedTrips;
}

export interface DriverRideRequest extends RideRequest {
  client: Pick<User, 'name' | 'phone'>;
}

export interface DriverRequestsResponse {
  success: boolean;
  requests: DriverRideRequest[];
}

export interface DriverTrip {
  id: number;
  request_id?: number;
  status: string;
  estimated_fare: number;
  final_fare?: number;
  driver_arrived_at?: string;
  started_at?: string;
  completed_at?: string;
  distance_travelled_km?: number;
  duration_travelled_min?: number;
}

export interface DriverTripResponse {
  success: boolean;
  message: string;
  trip: DriverTrip;
}

export interface AvailabilityResponse {
  success: boolean;
  message: string;
  availability_status: 'available' | 'unavailable';
}

export interface AdminStats {
  total_clients: number;
  total_drivers: number;
  pending_drivers: number;
  approved_drivers: number;
  active_trips: number;
  completed_trips: number;
  cancelled_trips: number;
  pending_requests: number;
  total_revenue: number;
}

export interface AdminDashboardResponse {
  success: boolean;
  stats: AdminStats;
  recent_trips: Trip[];
  recent_incidents: unknown[];
}

export interface AdminDriver {
  id: number;
  license_number: string;
  approval_status: string;
  rating_average: number;
  user: Pick<User, 'name' | 'email'>;
  vehicles: Vehicle[];
}

export interface AdminDriversResponse {
  success: boolean;
  drivers: AdminDriver[];
}

export interface AdminFaresResponse {
  success: boolean;
  fares: Fare[];
}

export interface AdminTripsResponse {
  success: boolean;
  trips: Trip[] | PaginatedTrips;
}
