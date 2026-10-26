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
        'foto_path',
    ];

    protected function casts(): array
    {
        return [
            'qty' => 'integer',
            'min' => 'integer',
            'precio' => 'decimal:2',
        ];
    }

    public function getFotoUrlAttribute(): ?string
    {
        if (! $this->foto_path) {
            return null;
        }
        if (str_starts_with((string) $this->foto_path, 'http://')
            || str_starts_with((string) $this->foto_path, 'https://')) {
            return $this->foto_path;
        }

        return asset('storage/'.$this->foto_path);
    }

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

    public function getPorcentajeAttribute(): int
    {
        $base = max($this->min * 2, 1);

        return min(100, (int) round(($this->qty / $base) * 100));
    }
}
