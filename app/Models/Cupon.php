<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Cupon extends Model
{
    protected $fillable = [
        'titulo',
        'descripcion',
        'codigo',
        'descuento_tipo', // porcentaje | monto_fijo
        'descuento_valor',
        'solo_vip',
        'fecha_vencimiento',
        'activo',
    ];

    protected $casts = [
        'solo_vip' => 'boolean',
        'activo' => 'boolean',
        'fecha_vencimiento' => 'date',
        'descuento_valor' => 'decimal:2',
    ];

    public function vencido(): bool
    {
        return $this->fecha_vencimiento !== null && $this->fecha_vencimiento->isPast();
    }
}
