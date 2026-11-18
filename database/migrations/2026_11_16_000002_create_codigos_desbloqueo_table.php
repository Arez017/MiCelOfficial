<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('codigos_desbloqueo', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dispositivo_id')->constrained('dispositivos')->cascadeOnDelete();
            $table->enum('tipo', ['pago', 'liberacion']);
            $table->date('vence_en')->nullable();       // nueva fecha que activa el código (null en liberación)
            $table->string('codigo', 20);
            $table->foreignId('cuota_id')->nullable()->constrained('cuotas')->nullOnDelete();
            $table->foreignId('generado_por')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('codigos_desbloqueo');
    }
};
