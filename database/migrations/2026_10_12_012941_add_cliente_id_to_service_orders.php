
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_orders', function (Blueprint $table) {
            if (! Schema::hasColumn('service_orders', 'cliente_id')) {
                $table->foreignId('cliente_id')
                    ->nullable()
                    ->after('phone')
                    ->constrained('clientes')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('service_orders', function (Blueprint $table) {
            if (Schema::hasColumn('service_orders', 'cliente_id')) {
                $table->dropConstrainedForeignId('cliente_id');
            }
        });
    }
};