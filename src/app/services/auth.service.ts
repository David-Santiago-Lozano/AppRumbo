import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, finalize, map, of, tap, throwError } from 'rxjs';
import { AuthResponse, User, UserRole } from '../models/api.models';
import { ApiService, RegisterClientRequest, RegisterDriverRequest } from './api.service';

export const SESSION_TOKEN_KEY = 'rumbo.access_token';
export const SESSION_TOKEN_TYPE_KEY = 'rumbo.token_type';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSubject = new BehaviorSubject<User | null>(null);
  readonly user$ = this.userSubject.asObservable();

  constructor(private readonly api: ApiService) {}

  get currentUser(): User | null {
    return this.userSubject.value;
  }

  get hasToken(): boolean {
    return Boolean(sessionStorage.getItem(SESSION_TOKEN_KEY));
  }

  login(login: string, password: string): Observable<User> {
    return this.api.login(login, password).pipe(map((response) => this.saveSession(response)));
  }

  register(payload: RegisterClientRequest | RegisterDriverRequest): Observable<User> {
    return this.api.register(payload).pipe(map((response) => this.saveSession(response)));
  }

  restoreSession(): Observable<User | null> {
    if (this.currentUser) {
      return of(this.currentUser);
    }
    if (!this.hasToken) {
      return of(null);
    }

    return this.api.me().pipe(
      map((response) => response.user),
      tap((user) => this.userSubject.next(user)),
      catchError((error: unknown) => {
        this.clearSession();
        return throwError(() => error);
      }),
    );
  }

  logout(): Observable<void> {
    return this.api.logout().pipe(
      map(() => undefined),
      finalize(() => this.clearSession()),
    );
  }

  clearSession(): void {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_TYPE_KEY);
    this.userSubject.next(null);
  }

  roleHome(role: UserRole): string {
    return `/${role}`;
  }

  private saveSession(response: AuthResponse): User {
    sessionStorage.setItem(SESSION_TOKEN_KEY, response.access_token);
    sessionStorage.setItem(SESSION_TOKEN_TYPE_KEY, response.token_type || 'Bearer');
    this.userSubject.next(response.user);
    return response.user;
  }
}
