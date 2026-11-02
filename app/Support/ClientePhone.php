<?php

namespace App\Support;

use App\Models\Cliente;

class ClientePhone
{
    public static function norm(?string $phone): string
    {
        $n = preg_replace('/\D+/', '', (string) $phone) ?: '';
        // quitar ceros a la izquierda raros
        return ltrim($n, '0') !== '' ? $n : $n;
    }

    /** Últimos 8 dígitos (móvil BO típico) */
    public static function tail(?string $phone, int $len = 8): string
    {
        $n = self::norm($phone);
        if (strlen($n) <= $len) {
            return $n;
        }

        return substr($n, -$len);
    }

    /**
     * 59161154206 ≈ 61154206 ≈ 591-61154206
     */
    public static function same(?string $a, ?string $b): bool
    {
        $x = self::norm($a);
        $y = self::norm($b);
        if ($x === '' || $y === '' || $x === 'SN' || $y === 'SN') {
            return false;
        }
        if ($x === $y) {
            return true;
        }
        // últimos 8 dígitos
        if (strlen($x) >= 7 && strlen($y) >= 7 && self::tail($x, 8) === self::tail($y, 8)) {
            return true;
        }
        // sufijo
        if (strlen($x) < strlen($y)) {
            [$x, $y] = [$y, $x];
        }

        return strlen($y) >= 7 && str_ends_with($x, $y);
    }

    public static function findByPhone(?string $phone, ?int $exceptId = null): ?Cliente
    {
        $norm = self::norm($phone);
        if ($norm === '' || strlen($norm) < 7) {
            return null;
        }

        return Cliente::query()
            ->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))
            ->get()
            ->first(fn (Cliente $c) => self::same($c->phone, $norm));
    }
}
