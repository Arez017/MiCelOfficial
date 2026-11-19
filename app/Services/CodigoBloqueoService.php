<?php

namespace App\Services;

use App\Models\CodigoDesbloqueo;
use App\Models\Dispositivo;
use App\Models\PlanPago;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;

/**
 * Genera los códigos que entiende la app Android CuotaLock (esquema v3).
 *
 * Formato: DDDDD-NNNN-MMMMMM
 *   DDDDD  = nuevo vencimiento, en días desde 1970-01-01 (99999 = liberar equipo)
 *   NNNN   = número de emisión del equipo (1, 2, 3...). El celular solo acepta un
 *            número MAYOR al último que usó: cada código sirve una sola vez.
 *   MMMMMM = 6 dígitos de HMAC-SHA256(clave_del_equipo, "CL3:<ID>:<DDDDD>:<NNNN>")
 *
 * La clave NO es global: cada celular genera la suya al instalarse (16 caracteres,
 * la muestra una sola vez para vincularlo) y aquí se guarda cifrada. Por eso:
 *  - un código solo funciona en el equipo para el que se emitió;
 *  - leer el APK o GitHub no permite fabricar códigos;
 *  - cada clic en «Generar código» da un código distinto.
 *
 * Mismo algoritmo en Policy.kt y herramientas/generar_codigo.py.
 */
class CodigoBloqueoService
{
    public const LIBERACION = 99999;

    public const MAX_SECUENCIA = 9999;

    public const ERROR_SIN_CLAVE = 'Este equipo no tiene clave de vinculación. Pide al cliente el celular, abre CuotaLock y usa «Cargar clave» con la clave de 16 caracteres que muestra la app.';

    private const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    // ---------------------------------------------------------------- clave del equipo

    /**
     * Normaliza la clave que escribe el vendedor ("abcd-efgh ijkl-mnop" → "ABCDEFGHIJKLMNOP").
     * Devuelve null si no tiene 16 caracteres base32 o si el dígito verificador no cuadra
     * (así un error de tipeo se detecta al vincular y no recién en el celular).
     */
    public static function normalizarClave(string $clave): ?string
    {
        $c = strtoupper((string) preg_replace('/[\s\-]+/', '', $clave));
        if (! preg_match('/^[A-Z2-7]{16}$/', $c)) {
            return null;
        }

        return self::verificador(substr($c, 0, 15)) === $c[15] ? $c : null;
    }

    /** Dígito verificador: suma ponderada de los 15 caracteres, módulo 32. */
    public static function verificador(string $quince): string
    {
        $suma = 0;
        for ($i = 0; $i < 15; $i++) {
            $suma += ($i + 1) * strpos(self::BASE32, $quince[$i]);
        }

        return self::BASE32[$suma % 32];
    }

    /** "ABCDEFGHIJKLMNOP" → "ABCD-EFGH-IJKL-MNOP" */
    public static function formatearClave(string $clave): string
    {
        return implode('-', str_split($clave, 4));
    }

    // ---------------------------------------------------------------- algoritmo puro

    public static function generar(string $clave, string $deviceId, int $dias, int $secuencia): string
    {
        $clave = self::normalizarClave($clave);
        if ($clave === null) {
            throw new InvalidArgumentException('Clave de vinculación inválida.');
        }

        $id = strtoupper(trim($deviceId));
        if (! preg_match('/^[0-9A-F]{8}$/', $id)) {
            throw new InvalidArgumentException('El ID del equipo debe tener 8 caracteres hexadecimales (0-9, A-F).');
        }
        if ($dias < 0 || $dias > self::LIBERACION) {
            throw new InvalidArgumentException("Día fuera de rango: {$dias}");
        }
        if ($secuencia < 1 || $secuencia > self::MAX_SECUENCIA) {
            throw new InvalidArgumentException("Número de emisión fuera de rango: {$secuencia}");
        }

        // Solo los 15 caracteres aleatorios forman la clave HMAC (el 16.º es el verificador)
        $hash = hash_hmac('sha256', "CL3:{$id}:{$dias}:{$secuencia}", substr($clave, 0, 15), true);
        $n = unpack('N', substr($hash, 0, 4))[1] & 0x7FFFFFFF;

        return sprintf('%05d-%04d-%06d', $dias, $secuencia, $n % 1000000);
    }

    // ---------------------------------------------------------------- fechas

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

    /** Fecha de la próxima cuota impaga + días de gracia. Null si ya pagó todo. */
    public static function vencimientoSugerido(PlanPago $plan): ?Carbon
    {
        $proxima = $plan->cuotas()->where('pagada', false)->orderBy('numero')->first();

        return $proxima
            ? Carbon::parse($proxima->fecha_vencimiento)->addDays((int) config('cuotalock.dias_gracia'))
            : null;
    }

    // ---------------------------------------------------------------- emisión

    /**
     * Firma un código nuevo para el equipo: toma el siguiente número de emisión con
     * bloqueo de fila (dos admins a la vez nunca reciben el mismo número) y lo registra.
     */
    private static function emitir(Dispositivo $dispositivo, string $tipo, int $dias, ?string $venceEn, ?int $userId, ?int $cuotaId = null): CodigoDesbloqueo
    {
        return DB::transaction(function () use ($dispositivo, $tipo, $dias, $venceEn, $userId, $cuotaId) {
            $d = Dispositivo::query()->lockForUpdate()->findOrFail($dispositivo->id);

            if (blank($d->clave)) {
                throw new RuntimeException(self::ERROR_SIN_CLAVE);
            }
            if ($d->secuencia >= self::MAX_SECUENCIA) {
                throw new RuntimeException('Este equipo agotó sus números de emisión: vuelve a vincularlo con una clave nueva.');
            }

            $secuencia = $d->secuencia + 1;
            $codigo = self::generar($d->clave, $d->device_id, $dias, $secuencia);

            $d->secuencia = $secuencia;
            if ($venceEn !== null) {
                $d->vence_en = $venceEn;
            }
            $d->save();

            $dispositivo->setRawAttributes($d->getAttributes(), true);

            return $d->codigos()->create([
                'tipo' => $tipo,
                'vence_en' => $venceEn,
                'codigo' => $codigo,
                'cuota_id' => $cuotaId,
                'generado_por' => $userId,
            ]);
        });
    }

    /** Código de liberación (99999). Cada llamada emite uno nuevo y de un solo uso. */
    public static function emitirLiberacion(Dispositivo $dispositivo, ?int $userId = null): CodigoDesbloqueo
    {
        return self::emitir($dispositivo, 'liberacion', self::LIBERACION, null, $userId);
    }

    /**
     * Emite (y registra en el historial) el código de pago del equipo.
     *
     * motivo: null = código emitido | 'liquidado' = no quedan cuotas | 'vencido' = aún hay cuotas vencidas
     *
     * @return array{codigo: ?CodigoDesbloqueo, motivo: ?string, vence_en: ?Carbon}
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

        $registro = self::emitir(
            $dispositivo,
            'pago',
            self::diasDesdeEpoch($fecha),
            $fecha->toDateString(),
            $userId,
            $cuotaId,
        );

        return ['codigo' => $registro, 'motivo' => null, 'vence_en' => $fecha];
    }
}
