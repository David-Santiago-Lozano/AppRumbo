# Rumbo

Frontend de movilidad urbana hecho con Angular e Ionic. Se integra con la API REST documentada para autenticación, clientes, conductores, administración y tarifas.

## Requisitos

- Node.js y npm.
- Acceso a la red o VPN donde está disponible el backend `20.20.1.22:8000`.
- Una cuenta de la API. Las cuentas de administrador deben ser creadas por el backend.

## Desarrollo

```powershell
npm install
npm start
```

Abre `http://localhost:4200`. La URL base de la API está en `src/environments/environment.ts`. Al iniciar sesión, las llamadas protegidas envían el JWT con el tipo de token que devuelve la API. El token se conserva solo en la sesión actual del navegador y se elimina al cerrar sesión.

## Funciones conectadas

- **Autenticación:** inicio de sesión y registro de clientes y conductores. El formulario de conductor incluye licencia y datos del vehículo.
- **Cliente:** consulta de tarifa pública, selección de origen y destino, estimación, creación y cancelación de solicitudes, estado activo, historial y calificaciones.
- **Conductor:** disponibilidad, solicitudes pendientes, aceptación, llegada, inicio y finalización del viaje, y envío de ubicación mientras está conectado.
- **Administrador:** indicadores, revisión y aprobación de conductores, consulta y creación de tarifas, filtros de viajes, reportes y registro de auditoría.
- **Mapa:** mapa interactivo con OpenStreetMap/Leaflet, búsqueda de lugares, rutas de conducción estimadas, selección de coordenadas al tocar el mapa, ubicación del dispositivo, seguimiento del conductor y orientación/brújula por sensor.

El backend no ofrece geocodificación ni cálculo de rutas. El cliente usa Nominatim para buscar lugares en Colombia cuando se confirma una búsqueda (no en cada tecla), y OSRM para dibujar rutas y estimar distancias/tiempos por carretera. Estas consultas salen a servicios públicos de OpenStreetMap; la búsqueda comparte el texto escrito y el cálculo de ruta comparte coordenadas. Sus resultados son orientativos, dependen de Internet y de los límites/disponibilidad del servicio público; no son navegación turn-by-turn ni un SLA de producción. La API tampoco ofrece un endpoint para recuperar un viaje activo del conductor tras recargar la página.

## Actualización del viaje

La API documentada no ofrece WebSockets ni eventos push. La app actualiza las solicitudes del conductor cada 3 segundos mientras está conectado, consulta el viaje activo del cliente cada 3 segundos mientras hay una solicitud/viaje y vuelve a 15 segundos cuando no hay actividad. La ubicación más reciente del conductor se envía cada 5 segundos mientras permanece conectado. Es una actualización de baja latencia mediante sondeo HTTP, no una transmisión instantánea; para sincronización inmediata, el backend debe incorporar WebSockets, SSE o notificaciones push.

La sección **Conductores** del panel de administración consulta la lista de solicitudes pendientes cada 3 segundos mientras permanece abierta. El registro del conductor crea la solicitud en el backend; la aprobación continúa siendo una acción manual del administrador. Esto no envía notificaciones push ni correo.

El panel del conductor incluye una simulación de demostración opcional: calcula una ruta y ETA orientativa, anima el vehículo durante unos 30 segundos y publica posiciones ficticias al endpoint de ubicación para que el cliente vea el marcador avanzar. El panel lo identifica como **MODO DEMO**; no la uses durante viajes reales. Al detener la demo, el envío de GPS real se reanuda si el navegador dispone de ubicación.

## Giroscopio y ubicación en teléfono

El navegador exige un contexto seguro para los sensores y la geolocalización. En un teléfono, la app debe abrirse desde un origen **HTTPS** y el usuario debe conceder permiso al tocar **Activar giroscopio** y **Mi ubicación**. El servidor de desarrollo `http://localhost:4200` sirve para probar la interfaz en el computador, pero abrirlo desde otro dispositivo usando la IP local no habilita por sí solo esos permisos. Para pruebas móviles, usa un entorno HTTPS aprobado por el curso.

El mapa descarga las teselas de OpenStreetMap desde Internet y conserva su atribución visible. También se usa `leaflet-rotate` para girar el mapa; ese paquete está licenciado bajo GPL-3.0, así que consulta con el profesor antes de distribuir públicamente el proyecto.

## Seguridad y alcance

La documentación describe `POST /api/auth/forgot-password` como cambio de contraseña enviando únicamente correo y contraseña nueva, sin código de verificación ni prueba de identidad. La interfaz no expone ese endpoint; pide al profesor un flujo de recuperación verificado antes de habilitarlo.

Las rutas de la interfaz y los controles por rol ayudan a la navegación, pero la autorización real debe seguir validándose en el backend. Las cuentas de conductor pueden quedar pendientes de aprobación y el servidor rechazará conectarlas hasta que un administrador las apruebe.

## Validación

```powershell
npm run build
```
