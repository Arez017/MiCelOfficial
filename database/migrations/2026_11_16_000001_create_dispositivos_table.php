<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dispositivos', function (Blueprint $table) {
            $table->id();
            // Un equipo con bloqueo por venta a crédito
            $table->foreignId('celular_venta_id')->unique()->constrained('celulares_ventas')->cascadeOnDelete();
            $table->string('device_id', 8)->unique(); // ID que muestra la app CuotaLock en el celular
            $table->date('vence_en')->nullable();      // último vencimiento entregado al equipo
            $table->enum('estado', ['activo', 'liberado'])->default('activo');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dispositivos');
    }
};
