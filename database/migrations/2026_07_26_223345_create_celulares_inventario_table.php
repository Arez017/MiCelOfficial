<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('celulares_inventario', function (Blueprint $table) {
            $table->id();
            $table->string('codigo')->unique();     // CELINV-001
            $table->string('modelo');
            $table->string('imei')->unique();        // un IMEI es único de por vida, no se repite ni vendido
            $table->string('estado');                 // Nuevo, Usado — Excelente, etc.
            $table->decimal('precio_compra', 10, 2);
            $table->string('sucursal')->nullable();
            $table->boolean('vendido')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('celulares_inventario');
    }
};