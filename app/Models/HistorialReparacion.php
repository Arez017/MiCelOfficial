<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class HistorialReparacion extends Model
{
    use HasFactory;

    protected $table = 'historial_reparaciones';

    protected $fillable = [
        'equipo',
        'descripcion',
        'foto_path',
        'fotos',
        'tecnico_id',
        'qr_data',
    ];

    protected function casts(): array
    {
        return [
            'fotos' => 'array',
        ];
    }

    public function tecnico()
    {
        return $this->belongsTo(User::class, 'tecnico_id');
    }
}
