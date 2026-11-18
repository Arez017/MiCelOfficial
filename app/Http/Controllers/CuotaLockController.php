<?php

namespace App\Http\Controllers;

use App\Models\CelularVenta;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

/**
 * Puente web ↔ app CuotaLock (bloqueo por falta de pago).
 */
class CuotaLockController extends Controller
{
    public function creditos(Request $request)
    {
        $this->assertStaff($request);

        if (! class_exists(CelularVenta::class)) {
            return response()->json([]);
        }

        $q = CelularVenta::query()->orderByDesc('id');

        // Solo crédito si existe la columna
        if (Schema::hasColumn((new CelularVenta)->getTable(), 'tipo_pago')) {
            $q->where(function ($w) {
                $w->where('tipo_pago', 'like', '%credit%')
                    ->orWhere('tipo_pago', 'like', '%cuota%');
            });
        }

        $rows = $q->limit(200)->get()->map(function ($v) {
            $bloqueado = (bool) ($v->bloqueado ?? $v->lock_status === 'bloqueado' ?? false);
            // Auto: si hay cuota vencida
            if (Schema::hasTable('cuotas')) {
                try {
                    $vencida = \DB::table('cuotas')
                        ->where('celular_venta_id', $v->id)
                        ->where('pagada', false)
                        ->whereDate('fecha_vencimiento', '<', now())
                        ->exists();
                    if ($vencida) {
                        $bloqueado = true;
                    }
                } catch (\Throwable $e) {
                }
            }

            return [
                'id' => $v->id,
                'code' => $v->code ?? $v->codigo ?? ('V-'.$v->id),
                'cliente' => $v->cliente_nombre ?? $v->cliente ?? $v->client_name ?? null,
                'modelo' => $v->modelo ?? null,
                'imei' => $v->imei ?? null,
                'estado_dispositivo' => $bloqueado ? 'bloqueado' : 'activo',
                'cuota_pendiente' => $v->cuota_monto ?? null,
                'proxima_vencimiento' => $v->proxima_cuota_at ?? null,
                'bloqueado' => $bloqueado,
            ];
        });

        return response()->json($rows->values());
    }

    public function pagarCuota(Request $request, int $ventaId)
    {
        $this->assertStaff($request);
        $data = $request->validate([
            'monto' => ['nullable', 'numeric', 'min:0'],
        ]);

        if (Schema::hasTable('cuotas')) {
            $cuota = \DB::table('cuotas')
                ->where('celular_venta_id', $ventaId)
                ->where('pagada', false)
                ->orderBy('fecha_vencimiento')
                ->first();
            if ($cuota) {
                \DB::table('cuotas')->where('id', $cuota->id)->update([
                    'pagada' => true,
                    'monto_pagado' => $data['monto'] ?? $cuota->monto ?? 0,
                    'pagada_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        // Si no quedan vencidas, desbloquear
        $this->syncBloqueo($ventaId);

        return response()->json(['message' => 'Cuota registrada', 'venta_id' => $ventaId]);
    }

    public function bloquear(Request $request, int $ventaId)
    {
        $this->assertStaff($request);
        $this->setBloqueo($ventaId, true);

        return response()->json(['message' => 'Dispositivo bloqueado', 'estado' => 'bloqueado']);
    }

    public function desbloquear(Request $request, int $ventaId)
    {
        $this->assertStaff($request);
        $this->setBloqueo($ventaId, false);

        return response()->json(['message' => 'Dispositivo desbloqueado', 'estado' => 'activo']);
    }

    /** App CuotaLock — público con imei */
    public function estadoDispositivo(Request $request)
    {
        $imei = preg_replace('/\D+/', '', (string) $request->query('imei', $request->input('imei', '')));
        if (strlen($imei) < 8) {
            return response()->json(['message' => 'IMEI requerido'], 422);
        }

        $venta = null;
        if (class_exists(CelularVenta::class) && Schema::hasColumn((new CelularVenta)->getTable(), 'imei')) {
            $venta = CelularVenta::where('imei', 'like', '%'.$imei.'%')->orderByDesc('id')->first();
        }

        if (! $venta) {
            return response()->json([
                'imei' => $imei,
                'estado' => 'activo',
                'mensaje' => 'Sin plan de crédito asociado',
            ]);
        }

        $bloqueado = (bool) ($venta->bloqueado ?? false);
        if (Schema::hasTable('cuotas')) {
            $vencida = \DB::table('cuotas')
                ->where('celular_venta_id', $venta->id)
                ->where('pagada', false)
                ->whereDate('fecha_vencimiento', '<', now())
                ->exists();
            if ($vencida) {
                $bloqueado = true;
            }
        }

        return response()->json([
            'imei' => $imei,
            'venta_id' => $venta->id,
            'estado' => $bloqueado ? 'bloqueado' : 'activo',
            'mensaje' => $bloqueado
                ? 'Equipo bloqueado por cuota vencida. Contacta al taller MiCel.'
                : 'Equipo al día',
            'taller' => 'MiCel · WhatsApp / sucursal',
        ]);
    }

    private function setBloqueo(int $ventaId, bool $bloqueado): void
    {
        if (! class_exists(CelularVenta::class)) {
            return;
        }
        $v = CelularVenta::find($ventaId);
        if (! $v) {
            abort(404, 'Venta no encontrada');
        }
        if (Schema::hasColumn($v->getTable(), 'bloqueado')) {
            $v->bloqueado = $bloqueado;
            $v->save();
        } elseif (Schema::hasColumn($v->getTable(), 'lock_status')) {
            $v->lock_status = $bloqueado ? 'bloqueado' : 'activo';
            $v->save();
        }
    }

    private function syncBloqueo(int $ventaId): void
    {
        if (! Schema::hasTable('cuotas')) {
            $this->setBloqueo($ventaId, false);

            return;
        }
        $vencida = \DB::table('cuotas')
            ->where('celular_venta_id', $ventaId)
            ->where('pagada', false)
            ->whereDate('fecha_vencimiento', '<', now())
            ->exists();
        $this->setBloqueo($ventaId, $vencida);
    }

    private function assertStaff(Request $request): void
    {
        $u = $request->user();
        if (! $u || (method_exists($u, 'esTecnico') && $u->esTecnico() && ! method_exists($u, 'esAdmin'))) {
            // permitir admin/super; denegar anónimo
        }
        if (! $u) {
            abort(401);
        }
    }
}
