import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth-page.component').then((module) => module.AuthPageComponent),
    data: { mode: 'login' },
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth-page.component').then((module) => module.AuthPageComponent),
    data: { mode: 'register' },
  },
  {
    path: 'client',
    canActivate: [authGuard, roleGuard],
    data: { role: 'client' },
    loadComponent: () => import('./pages/client-page.component').then((module) => module.ClientPageComponent),
  },
  {
    path: 'driver',
    canActivate: [authGuard, roleGuard],
    data: { role: 'driver' },
    loadComponent: () => import('./pages/driver-page.component').then((module) => module.DriverPageComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard],
    data: { role: 'admin' },
    loadComponent: () => import('./pages/admin-page.component').then((module) => module.AdminPageComponent),
  },
  { path: '**', redirectTo: '' },
];
