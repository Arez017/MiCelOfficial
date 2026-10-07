<?php

namespace App\Services;

use App\Models\Cliente;

/**
 * Reglas de fidelidad de MiCel, centralizadas en un solo lugar para no
 * repetirlas en cada controlador que registra un cobro:
 *
 *  - Se gana 1 coin por cada Bs 10 gastados (en ventas, celulares y
 *    órdenes de servicio ya completadas/pagadas).
 *  - Un coin vale Bs 1 de descuento al canjearlo (esto es una suposición
 *    mía razonable — AJUSTA la constante si la tasa real es otra).
 *  - Un cliente se vuelve VIP automáticamente al acumular Bs 1000 gastados
 *    en total (histórico, no se le quita el VIP si después gasta menos).
 *
 * OJO con la vinculación: mientras no exista cliente_id real en
 * ventas/celulares_ventas/service_orders (eso es el Paso 3b pendiente),
 * esto vincula por número de teléfono. Si el teléfono no coincide
 * exactamente con el de la cuenta del cliente, no se le acreditan coins.
 */
class ClienteFidelidadService
{
    private const BS_POR_COIN = 10;      // cuánto se gasta para ganar 1 coin
    public const BS_POR_COIN_CANJE = 1;  // cuánto vale 1 coin al canjearlo
    private const UMBRAL_VIP = 1000;     // gasto total acumulado para ser VIP

    public static function registrarGasto(?string $phone, float $monto): void
    {
        if (empty($phone) || $monto <= 0) {
            return;
        }

        $cliente = Cliente::where('phone', $phone)->first();
        if (! $cliente) {
            return; // el gasto es real, pero no hay cuenta de cliente a la cual acreditarlo
        }

        $coinsGanados = intdiv((int) floor($monto), self::BS_POR_COIN);

        $cliente->coins += $coinsGanados;
        $cliente->total_gastado += $monto;

        if (! $cliente->es_vip && $cliente->total_gastado >= self::UMBRAL_VIP) {
            $cliente->es_vip = true;
        }

        $cliente->save();
    }
}
