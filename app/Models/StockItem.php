<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StockItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'categoria',
        'qty',
        'min',
        'precio',
    ];

    protected function casts(): array
    {
        return [
            'qty' => 'integer',
            'min' => 'integer',
            'precio' => 'decimal:2',
        ];
    }

    // ===== Equivalentes a stockBadge()/stockColor() de app.js =====

    public function getSinStockAttribute(): bool
    {
        return $this->qty === 0;
    }

    public function getEsCriticoAttribute(): bool
    {
        return $this->qty > 0 && $this->qty < $this->min;
    }

    public function getEsOkAttribute(): bool
    {
        return $this->qty >= $this->min;
    }

    /** Porcentaje de barra de progreso, igual a tu cálculo: qty / (min*2) */
    public function getPorcentajeAttribute(): int
    {
        $base = max($this->min * 2, 1);
        return min(100, (int) round(($this->qty / $base) * 100));
    }
}