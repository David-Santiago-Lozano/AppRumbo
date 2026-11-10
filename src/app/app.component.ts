import { AsyncPipe } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { IonApp } from '@ionic/angular';
import { Observable } from 'rxjs';
import { catchError, of, switchMap } from 'rxjs';
import { User } from './models/api.models';
import { ApiService } from './services/api.service';
import { AuthService } from './services/auth.service';
import { apiErrorMessage } from './utils/api-error';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AsyncPipe, IonApp, RouterLink, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly user$: Observable<User | null>;
  logoutError = '';

  constructor(
    private readonly auth: AuthService,
    private readonly api: ApiService,
    private readonly router: Router,
  ) {
    this.user$ = this.auth.user$;
  }

  logout(): void {
    this.logoutError = '';
    const disconnectDriver = this.auth.currentUser?.role === 'driver'
      ? this.api.driverAvailability('unavailable').pipe(
        catchError((error: unknown) => {
          this.logoutError = `No se pudo desconectar al conductor del servidor: ${apiErrorMessage(error)}`;
          return of(null);
        }),
      )
      : of(null);

    disconnectDriver.pipe(switchMap(() => this.auth.logout())).subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: (error: unknown) => {
        this.logoutError = apiErrorMessage(error);
        void this.router.navigateByUrl('/login');
      },
    });
  }
}
