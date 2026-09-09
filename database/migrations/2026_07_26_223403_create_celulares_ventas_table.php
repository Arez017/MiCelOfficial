<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('celulares_ventas', function (Blueprint $table) {
            $table->id();
            $table->string('codigo')->unique(); // CEL-001
            $table->foreignId('celular_inventario_id')->constrained('celulares_inventario')->cascadeOnDelete();
            $table->string('cliente');
            $table->string('telefono')->nullable();
            $table->decimal('precio_venta', 10, 2);
            $table->enum('metodo_pago', ['efectivo', 'qr', 'transferencia', 'cuotas'])->default('efectivo');
            $table->string('sucursal')->nullable();
            $table->foreignId('vendedor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('celulares_ventas');
    }
};