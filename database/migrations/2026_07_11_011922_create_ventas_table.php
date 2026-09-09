<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ventas', function (Blueprint $table) {
            $table->id();
            $table->string('hora');
            $table->string('client')->nullable();
            $table->string('detail');
            $table->foreignId('tecnico_id')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('monto', 8, 2)->default(0);
            $table->enum('pago', ['efectivo', 'qr'])->default('efectivo');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ventas');
    }
};