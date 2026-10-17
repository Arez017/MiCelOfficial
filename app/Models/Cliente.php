<?php

namespace App\Models;

use Illuminate\Auth\Authenticatable;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Laravel\Sanctum\HasApiTokens;

class Cliente extends Model implements AuthenticatableContract
{
    use HasFactory, Authenticatable, HasApiTokens;

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
}
