<?php

namespace App\Services\Notificaciones;

use App\Models\Cliente;
use App\Models\ServiceOrder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Avisa al cliente, con una notificación push en la app MiCel, cuando su equipo
 * queda listo para recoger. Nunca lanza errores: si algo falla, solo lo registra.
 */
class NotificadorOrdenes
{
    public function __construct(private FcmService $fcm) {}

    public function ordenLista(int $ordenId): void
    {
        try {
            $orden = ServiceOrder::find($ordenId);
            if (! $orden || $orden->status !== 'listo' || ! $this->fcm->configurado()) {
                return;
            }

            $equipo = trim((string) $orden->device) !== '' ? $orden->device : 'equipo';
            $titulo = '¡Tu equipo está listo!';
            $cuerpo = "Tu {$equipo} ya está listo para recoger (orden {$orden->code}). Te esperamos en Laboratorio MiCel.";
            $datos = ['tipo' => 'orden_lista', 'orden' => (string) $orden->code];

            foreach ($this->destinatarios($orden) as $cliente) {
                $resultado = $this->fcm->enviar($cliente->fcm_token, $titulo, $cuerpo, $datos);
                if ($resultado === FcmService::RESULTADO_TOKEN_INVALIDO) {
                    // El celular ya no existe o desinstaló la app: no volver a intentarlo.
                    $cliente->forceFill(['fcm_token' => null, 'fcm_token_at' => null])->save();
                }
            }
        } catch (Throwable $e) {
            Log::warning('No se pudo avisar que la orden está lista', ['orden' => $ordenId, 'error' => $e->getMessage()]);
        }
    }

    /**
     * Clientes con la app abierta en algún celular: el dueño de la orden y, como en
     * «Mis órdenes» de la app, quien tenga el mismo teléfono.
     *
     * @return Collection<int, Cliente>
     */
    private function destinatarios(ServiceOrder $orden): Collection
    {
        return Cliente::query()
            ->whereNotNull('fcm_token')
            ->where('active', true)
            ->where(function ($q) use ($orden) {
                $q->where('id', $orden->cliente_id ?? 0);
                if (! empty($orden->phone)) {
                    $q->orWhere('phone', $orden->phone);
                }
            })
            ->limit(5)
            ->get()
            ->unique('fcm_token');
    }
}
