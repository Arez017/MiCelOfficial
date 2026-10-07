<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clientes', function (Blueprint $table) {
            $table->unsignedInteger('coins')->default(0)->after('visits');
            $table->decimal('total_gastado', 10, 2)->default(0)->after('coins');
            $table->boolean('es_vip')->default(false)->after('total_gastado');
        });
    }

    public function down(): void
    {
        Schema::table('clientes', function (Blueprint $table) {
            $table->dropColumn(['coins', 'total_gastado', 'es_vip']);
        });
    }
};
