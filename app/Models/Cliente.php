<?php

namespace App\Models;

use Illuminate\Auth\Authenticatable;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Laravel\Sanctum\HasApiTokens;

class Cliente extends Model implements AuthenticatableContract
{
    use Authenticatable, HasApiTokens, HasFactory;

    protected $fillable = [
        'code',
        'name',
        'phone',
        'sucursal_id',
        'visits',
        'last_visit',
        'username',
        'password',
        'coins',
        'total_gastado',
        'es_vip',
        'active',
    ];

    protected $hidden = [
        'password',
        'fcm_token',
    ];

    protected function casts(): array
    {
        return [
            'visits' => 'integer',
            'last_visit' => 'date',
            'password' => 'hashed',
            'coins' => 'integer',
            'total_gastado' => 'decimal:2',
            'es_vip' => 'boolean',
            'active' => 'boolean',
            'fcm_token_at' => 'datetime',
        ];
    }

    public function recibos()
    {
        return $this->hasMany(Recibo::class, 'cliente', 'name');
    }

    public function sucursal()
    {
        return $this->belongsTo(Sucursal::class);
    }

    public function tieneCuenta(): bool
    {
        return ! empty($this->username) && ! empty($this->password);
    }

    /**
     * Siguiente código libre (CLI-001, CLI-002…). Toma el número más alto entre
     * los ids y los códigos existentes, y salta los que ya estén usados, así
     * nunca choca aunque se hayan borrado o unificado clientes.
     */
    public static function siguienteCodigo(): string
    {
        $mayorCodigo = static::query()
            ->where('code', 'like', 'CLI-%')
            ->pluck('code')
            ->map(fn (string $c) => (int) preg_replace('/\D+/', '', $c))
            ->max() ?? 0;
        $numero = max($mayorCodigo, (int) (static::max('id') ?? 0)) + 1;

        do {
            $codigo = 'CLI-'.str_pad((string) $numero++, 3, '0', STR_PAD_LEFT);
        } while (static::where('code', $codigo)->exists());

        return $codigo;
    }
}
