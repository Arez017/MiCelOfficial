<?php

namespace App\Models;

use App\Services\Notificaciones\NotificadorOrdenes;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

use function Illuminate\Support\defer;

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

    protected static function booted(): void
    {
        // Notificación push al cliente cuando su equipo queda listo. Se envía
        // después de responder, así la web no espera a Firebase.
        static::updated(function (ServiceOrder $orden) {
            if ($orden->wasChanged('status') && $orden->status === 'listo') {
                $id = $orden->id;
                defer(fn () => app(NotificadorOrdenes::class)->ordenLista($id));
            }
        });
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
