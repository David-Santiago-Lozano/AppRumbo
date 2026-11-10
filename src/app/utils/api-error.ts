import { HttpErrorResponse } from '@angular/common/http';

const validationFieldLabels: Record<string, string> = {
  name: 'Nombre',
  email: 'Correo electrónico',
  phone: 'Teléfono',
  password: 'Contraseña',
  role: 'Tipo de cuenta',
  license_number: 'Número de licencia',
  plate: 'Placa',
  brand: 'Marca',
  model: 'Modelo',
  year: 'Año',
  capacity: 'Capacidad',
  color: 'Color',
};

function validationErrorMessage(errors: unknown): string | null {
  if (typeof errors !== 'object' || errors === null || Array.isArray(errors)) {
    return null;
  }

  const details = Object.entries(errors).flatMap(([field, messages]) => {
    const fieldLabel = validationFieldLabels[field] ?? field;
    const fieldMessages = Array.isArray(messages)
      ? messages.filter((message): message is string => typeof message === 'string')
      : typeof messages === 'string'
        ? [messages]
        : [];
    return fieldMessages.map((message) => `${fieldLabel}: ${message}`);
  });

  return details.length > 0 ? `Revisa los datos ingresados: ${details.join(' ')}` : null;
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (typeof body === 'object' && body !== null) {
      if ('errors' in body) {
        const validationMessage = validationErrorMessage(body.errors);
        if (validationMessage) {
          return validationMessage;
        }
      }
    }
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = (body as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }
    if (error.status === 0) {
      return 'No se pudo conectar con la API (20.20.1.22:8000). Verifica la red/VPN del curso y que el servidor esté encendido.';
    }
    if (error.status === 401) {
      return 'La sesión venció o los datos de acceso no son válidos.';
    }
    if (error.status === 403) {
      return 'El servidor no autoriza esta acción para tu cuenta.';
    }
    return `El servidor respondió con el código ${error.status}.`;
  }
  if (error instanceof Error && /failed to fetch|networkerror|load failed/i.test(error.message)) {
    return 'No se pudo conectar con la API (20.20.1.22:8000). Verifica la red/VPN del curso y que el servidor esté encendido.';
  }
  return 'Ocurrió un error inesperado. Inténtalo nuevamente.';
}
