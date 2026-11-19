<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Memoria del Asistente MiCEL: lo que dijo cada cliente y lo que respondió el bot.
     * Los mensajes bloqueados por el filtro quedan marcados para revisión.
     */
    public function up(): void
    {
        Schema::create('chatbot_mensajes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cliente_id')->constrained('clientes')->cascadeOnDelete();
            $table->enum('rol', ['cliente', 'asistente']);
            $table->text('contenido');
            $table->string('moderacion', 20)->nullable(); // null | grosero | obsceno | amenaza | queja | pausa | salida
            $table->boolean('marcado')->default(false);   // cuenta como falta de respeto
            $table->string('fuente', 20)->nullable();      // ia | micel | filtro
            $table->timestamps();

            $table->index(['cliente_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chatbot_mensajes');
    }
};
