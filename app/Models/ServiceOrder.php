<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ServiceOrder extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'client',
        'phone',
        'device',
        'service',
        'tecnico_id',
        'branch',
        'status',    // recepcion | diagnostico | en_proceso | listo
        'monto',
        'obs',
    ];

    protected function casts(): array
    {
        return [
            'monto' => 'decimal:2',
        ];
    }

    // ===== Relaciones =====

    public function tecnico()
    {
        return $this->belongsTo(User::class, 'tecnico_id');
    }

    public function recibo()
    {
        return $this->hasOne(Recibo::class, 'orden_id');
    }

    // ===== Comisión del técnico por esta orden =====
    // Reemplaza el array fijo `reporteTecnicos` de app.js — ahora se calcula real.
    // Ajusta el porcentaje (15%) si tu regla de negocio real es otra.
    public function getComisionAttribute(): float
    {
        if ($this->status !== 'listo') {
            return 0;
        }
        return round(((float) $this->monto) * 0.15, 2);
    }

    // ===== Badge de estado (equivalente a statusBadge() de app.js) =====
    public function getStatusLabelAttribute(): string
    {
        return match ($this->status) {
            'recepcion'   => 'Recepción',
            'diagnostico' => 'Diagnóstico',
            'en_proceso'  => 'En proceso',
            'listo'       => 'Listo',
            default       => $this->status,
        };
    }
}