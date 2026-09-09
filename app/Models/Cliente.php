<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Cliente extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'phone',
        'branch',
        'visits',
        'last_visit',
    ];

    protected function casts(): array
    {
        return [
            'visits' => 'integer',
            'last_visit' => 'date',
        ];
    }

    /** Recibos asociados a este cliente (por nombre, igual que tu JS actual) */
    public function recibos()
    {
        return $this->hasMany(Recibo::class, 'cliente', 'name');
    }
}