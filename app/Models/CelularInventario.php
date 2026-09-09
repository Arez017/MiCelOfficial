<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CelularInventario extends Model
{
    use HasFactory;

    protected $table = 'celulares_inventario';

    protected $fillable = [
        'codigo',
        'modelo',
        'imei',
        'estado',
        'precio_compra',
        'sucursal',
        'vendido',
    ];

    protected function casts(): array
    {
        return [
            'precio_compra' => 'decimal:2',
            'vendido' => 'boolean',
        ];
    }

    public function venta()
    {
        return $this->hasOne(CelularVenta::class, 'celular_inventario_id');
    }
}