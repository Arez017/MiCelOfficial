<?php

namespace App\Services;

use App\Models\Dispositivo;
use App\Models\PlanPago;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use InvalidArgumentException;
use RuntimeException;

/**
 * Genera los códigos que entiende la app Android CuotaLock.
 *
 * Formato: DDDDD-MMMMMM
 *   DDDDD  = nuevo vencimiento, en días desde 1970-01-01 (99999 = liberar equipo)
 *   MMMMMM = 6 dígitos de HMAC-SHA256(secret, "<ID_EQUIPO>:<DDDDD>")
 *
 * El mismo algoritmo está en Policy.kt y en herramientas/generar_codigo.py.
 *
 * CORRECCIONES respecto a v2:
 *  - "Hoy" se calcula en la zona horaria del negocio (America/La_Paz), no en la del
 *    servidor. Antes, por la tarde-noche en Bolivia el servidor ya estaba en "mañana"
 *    y podía marcar como vencida una cuota que aún estaba vigente.
 *  - Se valida el ID del equipo (8 caracteres hexadecimales) y el rango del día.
 */
class CodigoBloqueoService
{
    public const LIBERACION = 99999;

    public static function generar(string $deviceId, int $dias): string
    {
        $secret = (string) config('cuotalock.secret');
        if ($secret === '') {
            throw new RuntimeException('Falta CUOTALOCK_SECRET en el archivo .env (y ejecuta php artisan config:clear)');
        }

        $id = strtoupper(trim($deviceId));
        if (! preg_match('/^[0-9A-F]{8}$/', $id)) {
            throw new InvalidArgumentException('El ID del equipo debe tener 8 caracteres hexadecimales (0-9, A-F).');
        }
        if ($dias < 0 || $dias > self::LIBERACION) {
            throw new InvalidArgumentException("Día fuera de rango: {$dias}");
        }

        $hash = hash_hmac('sha256', $id . ':' . $dias, $secret, true);
        $n = unpack('N', substr($hash, 0, 4))[1] & 0x7fffffff;

        return sprintf('%05d-%06d', $dias, $n % 1000000);
    }

    /** Fecha y hora actual en la zona horaria del negocio. */
    public static function hoy(): Carbon
    {
        return Carbon::now((string) config('cuotalock.zona_horaria', 'America/La_Paz'));
    }

    /** Días transcurridos desde 1970-01-01 para el día calendario de la fecha dada. */
    public static function diasDesdeEpoch(CarbonInterface $fecha): int
    {
        return intdiv(gmmktime(0, 0, 0, (int) $fecha->month, (int) $fecha->day, (int) $fecha->year), 86400);
    }

    public static function paraFecha(string $deviceId, CarbonInterface $fecha): string
    {
        return self::generar($deviceId, self::diasDesdeEpoch($fecha));
    }

    public static function liberacion(string $deviceId): string
    {
        return self::generar($deviceId, self::LIBERACION);
    }

    /** Fecha de la próxima cuota impaga + días de gracia. Null si ya pagó todo. */
    public static function vencimientoSugerido(PlanPago $plan): ?Carbon
    {
        $proxima = $plan->cuotas()->where('pagada', false)->orderBy('numero')->first();

        return $proxima
            ? Carbon::parse($proxima->fecha_vencimiento)->addDays((int) config('cuotalock.dias_gracia'))
            : null;
    }

    /**
     * Emite (y registra en el historial) el código de pago del equipo.
     *
     * @return array{codigo: ?\App\Models\CodigoDesbloqueo, motivo: ?string, vence_en: ?Carbon}
     *   motivo: null = código emitido | 'liquidado' = no quedan cuotas | 'vencido' = aún hay cuotas vencidas
     */
    public static function emitirPago(Dispositivo $dispositivo, ?int $userId = null, ?int $cuotaId = null): array
    {
        $plan = $dispositivo->venta->planPago;
        if (! $plan) {
            return ['codigo' => null, 'motivo' => 'liquidado', 'vence_en' => null];
        }

        $fecha = self::vencimientoSugerido($plan);
        if ($fecha === null) {
            return ['codigo' => null, 'motivo' => 'liquidado', 'vence_en' => null];
        }

        // Si la próxima cuota ya venció, el equipo debe seguir bloqueado hasta ponerse al día
        if (self::diasDesdeEpoch($fecha) < self::diasDesdeEpoch(self::hoy())) {
            return ['codigo' => null, 'motivo' => 'vencido', 'vence_en' => $fecha];
        }

        $registro = $dispositivo->codigos()->create([
            'tipo' => 'pago',
            'vence_en' => $fecha->toDateString(),
            'codigo' => self::paraFecha($dispositivo->device_id, $fecha),
            'cuota_id' => $cuotaId,
            'generado_por' => $userId,
        ]);

        $dispositivo->update(['vence_en' => $fecha->toDateString()]);

        return ['codigo' => $registro, 'motivo' => null, 'vence_en' => $fecha];
    }
}
