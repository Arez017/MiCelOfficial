<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Prunable;

class ChatbotMensaje extends Model
{
    use Prunable;

    protected $table = 'chatbot_mensajes';

    protected $fillable = [
        'cliente_id',
        'rol',          // cliente | asistente
        'contenido',
        'moderacion',
        'marcado',
        'fuente',
    ];

    protected function casts(): array
    {
        return [
            'marcado' => 'boolean',
        ];
    }

    public function cliente()
    {
        return $this->belongsTo(Cliente::class);
    }

    /** Se borran solos pasado el tiempo de retención (php artisan model:prune). */
    public function prunable(): Builder
    {
        return static::where('created_at', '<', now()->subDays((int) config('chatbot.memoria.retener_dias', 90)));
    }
}
