<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CodigoDesbloqueo extends Model
{
    protected $table = 'codigos_desbloqueo'; // Eloquent adivinaría "codigo_desbloqueos"

    protected $fillable = [
        'dispositivo_id',
        'tipo', // pago | liberacion
        'vence_en',
        'codigo',
        'cuota_id',
        'generado_por',
    ];

    protected function casts(): array
    {
        return [
            'vence_en' => 'date',
        ];
    }

    public function dispositivo()
    {
        return $this->belongsTo(Dispositivo::class, 'dispositivo_id');
    }

    public function cuota()
    {
        return $this->belongsTo(Cuota::class);
    }

    public function generadoPor()
    {
        return $this->belongsTo(User::class, 'generado_por');
    }
}
