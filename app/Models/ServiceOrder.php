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
        'cliente_id',
        'device',
        'service',
        'tecnico_id',
        'sucursal_id',
        'status',
        'monto',
        'obs',
    ];

    protected function casts(): array
    {
        return [
            'monto' => 'decimal:2',
        ];
    }

    public function tecnico()
    {
        return $this->belongsTo(User::class, 'tecnico_id');
    }

    public function sucursal()
    {
        return $this->belongsTo(Sucursal::class);
    }

    public function cliente()
    {
        return $this->belongsTo(Cliente::class, 'cliente_id');
    }

    public function recibo()
    {
        return $this->hasOne(Recibo::class, 'orden_id');
    }

    public function getComisionAttribute(): float
    {
        if ($this->status !== 'listo') {
            return 0;
        }

        return round(((float) $this->monto) * 0.15, 2);
    }

    public function getStatusLabelAttribute(): string
    {
        return match ($this->status) {
            'recepcion' => 'Recepción',
            'diagnostico' => 'Diagnóstico',
            'en_proceso' => 'En proceso',
            'listo' => 'Listo',
            default => $this->status ?? '—',
        };
    }
}
