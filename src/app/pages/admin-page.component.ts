import { CurrencyPipe, JsonPipe } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EMPTY, Subscription, catchError, exhaustMap, timer } from 'rxjs';
import {
  AdminDashboardResponse,
  AdminDriver,
  AdminStats,
  AdminTripsResponse,
  Fare,
  Trip,
} from '../models/api.models';
import { ApiService, FareCreateRequest } from '../services/api.service';
import { apiErrorMessage } from '../utils/api-error';

type AdminTab = 'dashboard' | 'drivers' | 'fares' | 'trips' | 'reports' | 'audit';
type ApprovalFilter = '' | 'pending' | 'approved' | 'rejected' | 'suspended';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, JsonPipe],
  templateUrl: './admin-page.component.html',
  styleUrl: './admin-page.component.scss',
})
export class AdminPageComponent implements OnInit, OnDestroy {
  readonly tabs: { id: AdminTab; label: string }[] = [
    { id: 'dashboard', label: 'Resumen' },
    { id: 'drivers', label: 'Conductores' },
    { id: 'fares', label: 'Tarifas' },
    { id: 'trips', label: 'Viajes' },
    { id: 'reports', label: 'Reportes' },
    { id: 'audit', label: 'Auditoría' },
  ];
  activeTab: AdminTab = 'dashboard';
  stats: AdminStats | null = null;
  recentTrips: Trip[] = [];
  recentIncidents: unknown[] = [];
  drivers: AdminDriver[] = [];
  fares: Fare[] = [];
  trips: Trip[] = [];
  approvalFilter: ApprovalFilter = 'pending';
  tripFilters: Record<string, string> = { status: '', driver_id: '', client_id: '', date: '' };
  reportData: unknown = null;
  auditData: unknown = null;
  fareForm: FareCreateRequest = {
    name: '',
    base_fare: 3800,
    price_per_km: 1250,
    price_per_minute: 250,
    minimum_fare: 6500,
    surge_multiplier: 1,
    active: true,
  };
  adminNotes = '';
  busy = false;
  pageError = '';
  notice = '';
  private driversPolling?: Subscription;

  constructor(private readonly api: ApiService, private readonly changeDetector: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadDashboard();
  }

  ngOnDestroy(): void {
    this.driversPolling?.unsubscribe();
  }

  selectTab(tab: AdminTab): void {
    this.driversPolling?.unsubscribe();
    this.activeTab = tab;
    this.pageError = '';
    this.notice = '';
    switch (tab) {
      case 'dashboard':
        this.loadDashboard();
        break;
      case 'drivers':
        this.beginDriversPolling();
        break;
      case 'fares':
        this.loadFares();
        break;
      case 'trips':
        this.loadTrips();
        break;
      case 'reports':
        this.loadReports();
        break;
      case 'audit':
        this.loadAuditLogs();
        break;
    }
  }

  updateApproval(driver: AdminDriver, approvalStatus: 'approved' | 'rejected' | 'suspended'): void {
    this.busy = true;
    this.pageError = '';
    this.api.updateDriverApproval(driver.id, approvalStatus, this.adminNotes.trim()).subscribe({
      next: (response) => {
        this.busy = false;
        this.notice = response.message ?? `Estado actualizado: ${approvalStatus}`;
        this.changeDetector.markForCheck();
        this.loadDrivers();
      },
      error: (error: unknown) => {
        this.busy = false;
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  createFare(): void {
    this.busy = true;
    this.pageError = '';
    this.api.createFare(this.fareForm).subscribe({
      next: (response) => {
        this.busy = false;
        this.notice = response.message ?? 'Tarifa configurada.';
        this.fareForm = {
          ...this.fareForm,
          name: '',
        };
        this.changeDetector.markForCheck();
        this.loadFares();
      },
      error: (error: unknown) => {
        this.busy = false;
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  private loadDashboard(): void {
    this.api.adminDashboard().subscribe({
      next: (response: AdminDashboardResponse) => {
        this.stats = response.stats;
        this.recentTrips = response.recent_trips;
        this.recentIncidents = response.recent_incidents;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  loadDrivers(): void {
    this.api.adminDrivers(this.approvalFilter).subscribe({
      next: (response) => {
        this.drivers = response.drivers;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  private beginDriversPolling(): void {
    this.driversPolling = timer(0, 3000).pipe(
      exhaustMap(() => this.api.adminDrivers(this.approvalFilter).pipe(
        catchError((error: unknown) => {
          this.pageError = apiErrorMessage(error);
          this.changeDetector.markForCheck();
          return EMPTY;
        }),
      )),
    ).subscribe({
      next: (response) => {
        this.drivers = response.drivers;
        this.changeDetector.markForCheck();
      },
    });
  }

  private loadFares(): void {
    this.api.adminFares().subscribe({
      next: (response) => {
        this.fares = response.fares;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  loadTrips(): void {
    this.api.adminTrips(this.tripFilters).subscribe({
      next: (response: AdminTripsResponse) => {
        const result = response.trips;
        this.trips = Array.isArray(result) ? result : result.data;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  private loadReports(): void {
    this.api.adminReports().subscribe({
      next: (response) => {
        this.reportData = response;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  private loadAuditLogs(): void {
    this.api.adminAuditLogs().subscribe({
      next: (response) => {
        this.auditData = response;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.pageError = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }
}
