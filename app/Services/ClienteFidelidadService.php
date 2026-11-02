<?php

namespace App\Services;

use App\Models\Cliente;
use App\Support\ClientePhone;

class ClienteFidelidadService
{
    private const BS_POR_COIN = 10;

    public const BS_POR_COIN_CANJE = 1;

    private const UMBRAL_VIP = 1000;

    /**
     * Acredita coins.
     * Uso nuevo:  registrarGasto($clienteId, $phone, $monto)
     * Uso viejo:  registrarGasto($phone, $monto)  ← sigue funcionando
     */
    public static function registrarGasto(mixed $clienteIdOrPhone = null, mixed $phoneOrMonto = null, ?float $monto = null): void
    {
        // Compat: registrarGasto($phone, $monto)
        if (is_string($clienteIdOrPhone) || (is_null($clienteIdOrPhone) && is_numeric($phoneOrMonto) && $monto === null)) {
            $phone = is_string($clienteIdOrPhone) ? $clienteIdOrPhone : null;
            $amount = (float) $phoneOrMonto;
            $clienteId = null;
        } else {
            $clienteId = is_numeric($clienteIdOrPhone) ? (int) $clienteIdOrPhone : null;
            $phone = is_string($phoneOrMonto) ? $phoneOrMonto : null;
            $amount = (float) ($monto ?? 0);
        }

        if ($amount <= 0) {
            return;
        }

        $cliente = self::resolverCliente($clienteId, $phone);
        if (! $cliente) {
            return;
        }

        $coinsGanados = intdiv((int) floor($amount), self::BS_POR_COIN);
        if ($coinsGanados <= 0 && $amount > 0) {
            // menos de Bs 10 → 0 coins (regla de negocio)
        }

        $cliente->coins = (int) $cliente->coins + $coinsGanados;
        $cliente->total_gastado = (float) $cliente->total_gastado + $amount;

        if (! $cliente->es_vip && $cliente->total_gastado >= self::UMBRAL_VIP) {
            $cliente->es_vip = true;
        }

        $cliente->save();
    }

    public static function resolverCliente(?int $clienteId, ?string $phone): ?Cliente
    {
        if ($clienteId) {
            $c = Cliente::find($clienteId);
            if ($c) {
                return $c;
            }
        }

        if (! empty($phone)) {
            $norm = preg_replace('/\D+/', '', $phone);
            if ($norm !== '') {
                // Match exacto o por sufijo (59161154206 vs 61154206)
                return Cliente::all()->first(function (Cliente $c) use ($norm) {
                    $cp = preg_replace('/\D+/', '', (string) $c->phone);
                    if ($cp === '' || $cp === 'SN' || $cp === 'S/N') {
                        return false;
                    }
                    if ($cp === $norm) {
                        return true;
                    }
                    // el más largo termina con el más corto (mín. 7 dígitos)
                    $a = $cp;
                    $b = $norm;
                    if (strlen($a) < strlen($b)) {
                        [$a, $b] = [$b, $a];
                    }
                    return strlen($b) >= 7 && str_ends_with($a, $b);
                });
            }
        }

        return null;
    }
}
