<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PlanPago extends Model
{
    use HasFactory;

    protected $table = 'planes_pago';

    protected $fillable = [
        'celular_venta_id',
        'total',
        'inicial',
        'saldo',
        'numero_cuotas',
        'frecuencia', // semanal | quincenal | mensual
        'doc_ci',
        'doc_boleta',
        'doc_luz',
        'doc_afp',
    ];

    protected function casts(): array
    {
        return [
            'total' => 'decimal:2',
            'inicial' => 'decimal:2',
            'saldo' => 'decimal:2',
            'doc_ci' => 'boolean',
            'doc_boleta' => 'boolean',
            'doc_luz' => 'boolean',
            'doc_afp' => 'boolean',
        ];
    }

    public function venta()
    {
        return $this->belongsTo(CelularVenta::class, 'celular_venta_id');
    }

    public function cuotas()
    {
        return $this->hasMany(Cuota::class, 'plan_pago_id')->orderBy('numero');
    }

    public function getSaldoPendienteAttribute(): float
    {
        return round((float) $this->cuotas()->where('pagada', false)->sum('monto'), 2);
    }

    public function getTodosLosDocumentosPresentesAttribute(): bool
    {
        return $this->doc_ci && $this->doc_boleta && $this->doc_luz && $this->doc_afp;
    }
}