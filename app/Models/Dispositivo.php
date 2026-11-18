<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Dispositivo extends Model
{
    protected $table = 'dispositivos';

    protected $fillable = [
        'celular_venta_id',
        'device_id',
        'vence_en',
        'estado', // activo | liberado
    ];

    protected function casts(): array
    {
        return [
            'vence_en' => 'date',
        ];
    }

    public function venta()
    {
        return $this->belongsTo(CelularVenta::class, 'celular_venta_id');
    }

    public function codigos()
    {
        return $this->hasMany(CodigoDesbloqueo::class, 'dispositivo_id')->orderByDesc('id');
    }

    public function ultimoCodigo()
    {
        return $this->hasOne(CodigoDesbloqueo::class, 'dispositivo_id')->latestOfMany();
    }
}
