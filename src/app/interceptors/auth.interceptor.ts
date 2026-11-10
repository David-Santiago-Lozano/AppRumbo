import { HttpInterceptorFn } from '@angular/common/http';
import { SESSION_TOKEN_KEY, SESSION_TOKEN_TYPE_KEY } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
  if (!token) {
    return next(request);
  }

  const tokenType = sessionStorage.getItem(SESSION_TOKEN_TYPE_KEY) || 'Bearer';
  return next(request.clone({
    setHeaders: { Authorization: `${tokenType} ${token}` },
  }));
};
