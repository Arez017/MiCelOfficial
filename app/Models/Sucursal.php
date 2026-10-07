<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Sucursal extends Model
{
    protected $table = 'sucursales'; // Eloquent asume "sucursals" (inglés) por defecto — se lo corregimos

    protected $fillable = [
        'nombre',
        'direccion',
        'telefono',
        'activa',
    ];

    protected $casts = [
        'activa' => 'boolean',
    ];

    public function usuarios()
    {
        return $this->hasMany(User::class);
    }

    public function clientes()
    {
        return $this->hasMany(Cliente::class);
    }

    public function serviceOrders()
    {
        return $this->hasMany(ServiceOrder::class);
    }

    public function recibos()
    {
        return $this->hasMany(Recibo::class);
    }

    public function celularesInventario()
    {
        return $this->hasMany(CelularInventario::class);
    }

    public function celularesVentas()
    {
        return $this->hasMany(CelularVenta::class);
    }
}
