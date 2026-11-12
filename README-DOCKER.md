# Docker para MiCel (Laravel + PostgreSQL)

## Archivos incluidos

- `Dockerfile`
- `docker-compose.yml`
- `docker/entrypoint.sh`
- `docker/nginx.conf`
- `.env.docker.example`

## Cómo usar (pasos)

1. Copia **todos** estos archivos a la **raíz** de tu proyecto Laravel  
   (donde está el `composer.json` y el `artisan`).

2. Asegúrate de tener Docker Desktop instalado y corriendo.

3. En la raíz del proyecto ejecuta:

```bash
docker compose up -d --build
```

4. Abre en el navegador:

```
http://localhost:8080
```

5. Para entrar al contenedor y correr comandos Artisan:

```bash
docker compose exec app bash
# o directamente:
docker compose exec app php artisan migrate
docker compose exec app php artisan db:seed
```

6. Para parar todo:

```bash
docker compose down
```

## Notas importantes

- La base de datos Docker usa el puerto **5433** en tu máquina (para no chocar con Herd).
- Dentro de Docker el host de la base es `db` (no `127.0.0.1`).
- Puedes seguir usando Herd normalmente. Docker es solo otra forma de levantar el mismo proyecto.
- La primera vez puede tardar un poco porque descarga las imágenes y construye el contenedor.

## Variables de entorno

Copia el contenido de `.env.docker.example` a tu `.env` (o crea un `.env.docker`) cuando quieras usar Docker.
