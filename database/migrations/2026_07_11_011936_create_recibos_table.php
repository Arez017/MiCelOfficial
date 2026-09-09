<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recibos', function (Blueprint $table) {
            $table->id();
            $table->string('num_recibo')->unique();
            $table->foreignId('orden_id')->nullable()->constrained('service_orders')->nullOnDelete();
            $table->string('cliente');
            $table->string('telefono')->nullable();
            $table->string('equipo');
            $table->string('servicio');
            $table->decimal('monto', 8, 2)->default(0);
            $table->string('pago');
            $table->foreignId('tecnico_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('sucursal')->nullable();
            $table->text('obs')->nullable();
            $table->string('tipo')->nullable();
            $table->string('hora')->nullable();
            $table->date('fecha')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recibos');
    }
};