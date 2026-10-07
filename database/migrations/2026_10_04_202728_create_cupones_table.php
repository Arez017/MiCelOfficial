<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cupones', function (Blueprint $table) {
            $table->id();
            $table->string('titulo');
            $table->text('descripcion')->nullable();
            $table->string('codigo')->unique();
            $table->enum('descuento_tipo', ['porcentaje', 'monto_fijo']);
            $table->decimal('descuento_valor', 8, 2);
            $table->boolean('solo_vip')->default(false);
            $table->date('fecha_vencimiento')->nullable(); // null = sin vencimiento
            $table->boolean('activo')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cupones');
    }
};
