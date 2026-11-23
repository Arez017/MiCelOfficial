# MiCel · Sistema web y API

Sistema de información web-móvil para las sucursales de **Laboratorio «MiCel»** (El Alto, Bolivia): servicio técnico de celulares, control de stock, ventas y venta a crédito con bloqueo por cuota vencida.

Este repositorio contiene la **web del personal** y la **API REST** que consumen las apps móviles. Las apps están en [Arez017/MiCel](https://github.com/Arez017/MiCel), en la carpeta `App Movil/`:

- `micel`: app del cliente (Flutter).
- `cuotalock`: app de bloqueo para equipos vendidos a crédito (Android).

> Cualquier cambio en la API (rutas, respuestas o autenticación) debe revisarse contra esas apps para no romperlas.

## Qué hace

- **Órdenes de servicio** con código de seguimiento y estados (recepción → listo), recibos e historial de reparaciones.
- **Stock de repuestos** con descuento automático por reparación y alerta de stock mínimo, sincronizado entre sucursales.
- **Ventas**: punto de venta, celulares por IMEI, cupones y reportes por técnico y por sucursal.
- **Venta a crédito con CuotaLock**: planes de pago, cuotas y códigos de desbloqueo que el celular valida sin internet.
- **App del cliente**: cuenta propia, seguimiento de equipos, MiCEL Coins y asistente con IA (Gemini) con filtro de lenguaje.
- **Aviso push** (Firebase Cloud Messaging): «¡Tu equipo está listo!» cuando la orden pasa a *listo*.
- **Roles**: Super Admin, Administrador y Técnico.

## Tecnologías

PHP 8.4 · Laravel 12 · Sanctum · PostgreSQL (SQLite en pruebas) · Pest · Docker

## Instalación local

```bash
git clone https://github.com/Arez017/MiCelOfficial.git
cd MiCelOfficial
composer run setup          # instala dependencias, crea .env y APP_KEY, migra
php artisan db:seed         # datos de ejemplo (ver «Usuarios de ejemplo»)
composer run dev            # servidor, cola y Vite
```

Con Laravel Herd basta con dejar la carpeta dentro de `Herd` y abrir `http://<nombre-de-la-carpeta>.test`.

Para levantarlo con Docker y PostgreSQL, ve a [README-DOCKER.md](README-DOCKER.md).

## Configuración (`.env`)

Copia `.env.example` y completa lo que vayas a usar. **Nunca subas el `.env` ni las credenciales al repositorio.**

| Variable | Para qué sirve |
|---|---|
| `DB_*` | Conexión a la base de datos (PostgreSQL en producción). |
| `SEED_PASSWORD` | Contraseña de los usuarios de ejemplo. Si está vacía, `db:seed` genera una al azar y la muestra una vez. |
| `MICEL_CHAT_API_KEY` | Clave de Gemini para el asistente. Sin ella, el chat responde con el menú básico. |
| `MICEL_CHAT_MODEL`, `MICEL_CHAT_REASONING` | Modelo y nivel de razonamiento (`low` evita que la respuesta tarde demasiado). |
| `FCM_CREDENTIALS`, `FCM_PROJECT_ID` | Cuenta de servicio de Firebase para los avisos push. Guarda el JSON fuera de git (por ejemplo, en `storage/app/`). |
| `CUOTALOCK_DIAS_GRACIA`, `CUOTALOCK_ZONA` | Días de gracia antes del bloqueo y zona horaria de las cuotas. |

## Usuarios de ejemplo

`php artisan db:seed` crea las sucursales, los usuarios del personal y datos de prueba. Todos los usuarios reciben la contraseña de `SEED_PASSWORD`, o una generada al azar si no la defines.

En una base real, cambia las contraseñas desde el panel después del primer ingreso.

## Pruebas

```bash
composer test
```

## Antes de producción

- `APP_ENV=production` y `APP_DEBUG=false`.
- Clave propia de Gemini y cuenta de servicio de Firebase propia, sin subirlas al repositorio.
- `php artisan config:cache` y `php artisan route:cache` después de cada despliegue.

## Autor

[Arez017](https://github.com/Arez017) — proyecto de grado, Instituto Tecnológico INFOCAL La Paz, 2026.
