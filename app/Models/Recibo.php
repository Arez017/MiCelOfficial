<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Recibo extends Model
{
    use HasFactory;

    protected $fillable = [
        'num_recibo',
        'orden_id',
        'cliente',
        'telefono',
        'equipo',
        'servicio',
        'monto',
        'pago',
        'tecnico_id',
        'sucursal',
        'obs',
        'tipo',
        'hora',
        'fecha',
    ];

    protected function casts(): array
    {
        return [
            'monto' => 'decimal:2',
            'fecha' => 'date',
        ];
    }

    public function orden()
    {
        return $this->belongsTo(ServiceOrder::class, 'orden_id');
    }

    public function tecnico()
    {
        return $this->belongsTo(User::class, 'tecnico_id');
    }
}