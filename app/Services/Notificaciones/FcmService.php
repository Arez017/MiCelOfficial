<?php

namespace App\Services\Notificaciones;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Envío de notificaciones push con Firebase Cloud Messaging (API HTTP v1).
 *
 * Usa la cuenta de servicio de Firebase (archivo JSON indicado en FCM_CREDENTIALS)
 * para obtener un token OAuth firmado con RS256 y enviar el mensaje. No necesita
 * paquetes adicionales. Si Firebase no está configurado, no hace nada: el resto
 * del sistema funciona igual.
 */
class FcmService
{
    public const RESULTADO_ENVIADO = 'enviado';
    public const RESULTADO_TOKEN_INVALIDO = 'token_invalido';
    public const RESULTADO_ERROR = 'error';
    public const RESULTADO_DESACTIVADO = 'desactivado';

    private const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

    public function configurado(): bool
    {
        return $this->credenciales() !== null;
    }

    /**
     * Envía una notificación a un celular.
     *
     * @param  array<string, string>  $datos  datos extra que recibe la app (solo texto)
     * @return string una de las constantes RESULTADO_*
     */
    public function enviar(string $token, string $titulo, string $cuerpo, array $datos = []): string
    {
        $cred = $this->credenciales();
        if ($cred === null) {
            return self::RESULTADO_DESACTIVADO;
        }

        try {
            $acceso = $this->tokenDeAcceso($cred);
            if ($acceso === null) {
                return self::RESULTADO_ERROR;
            }

            $respuesta = Http::withToken($acceso)
                ->timeout((int) config('services.fcm.timeout', 8))
                ->post("https://fcm.googleapis.com/v1/projects/{$cred['project_id']}/messages:send", [
                    'message' => [
                        'token' => $token,
                        'notification' => ['title' => $titulo, 'body' => $cuerpo],
                        'data' => array_map('strval', $datos),
                        'android' => [
                            'priority' => 'HIGH',
                            'notification' => ['channel_id' => config('services.fcm.canal', 'micel_ordenes')],
                        ],
                    ],
                ]);

            if ($respuesta->successful()) {
                return self::RESULTADO_ENVIADO;
            }

            $estado = $respuesta->json('error.status');
            $detalle = collect($respuesta->json('error.details', []))->pluck('errorCode')->filter()->first();
            if ($respuesta->status() === 404 || $estado === 'NOT_FOUND' || $detalle === 'UNREGISTERED') {
                return self::RESULTADO_TOKEN_INVALIDO;
            }
            if ($respuesta->status() === 401) {
                Cache::forget($this->claveCache($cred));
            }

            Log::warning('FCM: no se pudo enviar la notificación', ['http' => $respuesta->status(), 'estado' => $estado]);

            return self::RESULTADO_ERROR;
        } catch (Throwable $e) {
            Log::warning('FCM: error al enviar la notificación', ['error' => $e->getMessage()]);

            return self::RESULTADO_ERROR;
        }
    }

    /**
     * Lee la cuenta de servicio. Devuelve null si falta o está incompleta.
     *
     * @return array{project_id: string, client_email: string, private_key: string, token_uri: string}|null
     */
    private function credenciales(): ?array
    {
        $ruta = (string) config('services.fcm.credentials', '');
        if ($ruta === '') {
            return null;
        }
        if (! str_starts_with($ruta, '/') && ! preg_match('/^[A-Za-z]:[\\\\\/]/', $ruta)) {
            $ruta = base_path($ruta);
        }
        if (! is_file($ruta)) {
            return null;
        }

        $json = json_decode((string) file_get_contents($ruta), true);
        if (! is_array($json) || empty($json['client_email']) || empty($json['private_key'])) {
            return null;
        }

        $proyecto = (string) (config('services.fcm.project_id') ?: ($json['project_id'] ?? ''));
        if ($proyecto === '') {
            return null;
        }

        return [
            'project_id' => $proyecto,
            'client_email' => $json['client_email'],
            'private_key' => $json['private_key'],
            'token_uri' => $json['token_uri'] ?? 'https://oauth2.googleapis.com/token',
        ];
    }

    /** Token OAuth de Google, guardado en caché hasta 5 minutos antes de que venza. */
    private function tokenDeAcceso(array $cred): ?string
    {
        $clave = $this->claveCache($cred);
        if ($guardado = Cache::get($clave)) {
            return $guardado;
        }

        $ahora = time();
        $cabecera = $this->base64Url(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
        $datos = $this->base64Url(json_encode([
            'iss' => $cred['client_email'],
            'scope' => self::SCOPE,
            'aud' => $cred['token_uri'],
            'iat' => $ahora,
            'exp' => $ahora + 3600,
        ]));
        $firma = '';
        if (! openssl_sign("{$cabecera}.{$datos}", $firma, $cred['private_key'], OPENSSL_ALGO_SHA256)) {
            Log::warning('FCM: la clave privada de la cuenta de servicio no es válida');

            return null;
        }
        $jwt = "{$cabecera}.{$datos}.".$this->base64Url($firma);

        $respuesta = Http::asForm()->timeout(8)->post($cred['token_uri'], [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $jwt,
        ]);
        $acceso = $respuesta->json('access_token');
        if (! $respuesta->successful() || ! $acceso) {
            Log::warning('FCM: Google rechazó la cuenta de servicio', ['http' => $respuesta->status()]);

            return null;
        }

        $dura = max(60, (int) $respuesta->json('expires_in', 3600) - 300);
        Cache::put($clave, $acceso, $dura);

        return $acceso;
    }

    private function claveCache(array $cred): string
    {
        return 'fcm_token_acceso_'.md5($cred['client_email']);
    }

    private function base64Url(string $texto): string
    {
        return rtrim(strtr(base64_encode($texto), '+/', '-_'), '=');
    }
}
