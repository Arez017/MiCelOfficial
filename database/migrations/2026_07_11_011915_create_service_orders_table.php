<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
public function up(): void
    {
        Schema::create('service_orders', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('client');
            $table->string('phone')->nullable();
            $table->string('device');
            $table->string('service');
            $table->foreignId('tecnico_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('branch')->nullable();
            $table->enum('status', ['recepcion', 'diagnostico', 'en_proceso', 'listo'])->default('recepcion');
            $table->decimal('monto', 8, 2)->default(0);
            $table->text('obs')->nullable();
            $table->timestamps();
        });
    }
    
    public function down(): void
    {
        Schema::dropIfExists('service_orders');
    }
};