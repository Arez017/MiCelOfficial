<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Cuota extends Model
{
    use HasFactory;

    protected $table = 'cuotas';

    protected $fillable = [
        'plan_pago_id',
        'numero',
        'fecha_vencimiento',
        'monto',
        'pagada',
        'fecha_pago',
    ];

    protected function casts(): array
    {
        return [
            'fecha_vencimiento' => 'date',
            'monto' => 'decimal:2',
            'pagada' => 'boolean',
            'fecha_pago' => 'datetime',
        ];
    }

    public function plan()
    {
        return $this->belongsTo(PlanPago::class, 'plan_pago_id');
    }

    public function getVencidaAttribute(): bool
    {
        return !$this->pagada && $this->fecha_vencimiento->isPast();
    }
}