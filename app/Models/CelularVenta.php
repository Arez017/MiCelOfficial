<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CelularVenta extends Model
{
    use HasFactory;

    protected $table = 'celulares_ventas';

    protected $fillable = [
        'codigo',
        'celular_inventario_id',
        'cliente',
        'telefono',
        'precio_venta',
        'metodo_pago', // efectivo | qr | transferencia | cuotas
        'sucursal',
        'vendedor_id',
    ];

    protected function casts(): array
    {
        return [
            'precio_venta' => 'decimal:2',
        ];
    }

    public function equipo()
    {
        return $this->belongsTo(CelularInventario::class, 'celular_inventario_id');
    }

    public function vendedor()
    {
        return $this->belongsTo(User::class, 'vendedor_id');
    }

    public function planPago()
    {
        return $this->hasOne(PlanPago::class, 'celular_venta_id');
    }

    /** Ganancia real de esta venta (precio de venta - precio de compra del equipo) */
    public function getGananciaAttribute(): float
    {
        return round(((float) $this->precio_venta) - ((float) $this->equipo->precio_compra), 2);
    }
}