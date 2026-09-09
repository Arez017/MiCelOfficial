<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('planes_pago', function (Blueprint $table) {
            $table->id();
            $table->foreignId('celular_venta_id')->unique()->constrained('celulares_ventas')->cascadeOnDelete();
            $table->decimal('total', 10, 2);
            $table->decimal('inicial', 10, 2)->default(0);
            $table->decimal('saldo', 10, 2);
            $table->unsignedTinyInteger('numero_cuotas'); // máx. 15, validado en el controlador
            $table->enum('frecuencia', ['semanal', 'quincenal', 'mensual'])->default('mensual');

            // Checklist de documentos requeridos (Plan Cuotas MiCel)
            $table->boolean('doc_ci')->default(false);
            $table->boolean('doc_boleta')->default(false);
            $table->boolean('doc_luz')->default(false);
            $table->boolean('doc_afp')->default(false);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('planes_pago');
    }
};