<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Dispositivo extends Model
{
    protected $table = 'dispositivos';

    protected $fillable = [
        'celular_venta_id',
        'device_id',
        'clave',     // clave propia del equipo (16 caracteres), cifrada con APP_KEY
        'secuencia', // último número de emisión usado en un código
        'vence_en',
        'estado', // activo | liberado
    ];

    /** La clave nunca sale en respuestas JSON. */
    protected $hidden = ['clave'];

    protected function casts(): array
    {
        return [
            'vence_en' => 'date',
            'clave' => 'encrypted',
            'secuencia' => 'integer',
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
