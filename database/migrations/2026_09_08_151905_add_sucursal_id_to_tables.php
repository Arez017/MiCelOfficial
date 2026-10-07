<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Se agrega sucursal_id como columna NUEVA, dejando la columna vieja
     * (branch / sucursal, texto libre) intacta por ahora. Esto permite
     * migrar los datos en el siguiente paso sin romper nada que ya esté
     * leyendo/escribiendo esas columnas de texto (controladores, app Flutter).
     * La columna vieja se elimina en una migración aparte, después de
     * actualizar los controladores para que usen sucursal_id.
     */
    private array $tablas = [
        'users',
        'clientes',
        'service_orders',
        'recibos',
        'celulares_inventario',
        'celulares_ventas',
    ];

    public function up(): void
    {
        foreach ($this->tablas as $tabla) {
            Schema::table($tabla, function (Blueprint $table) {
                $table->foreignId('sucursal_id')
                    ->nullable()
                    ->after('id')
                    ->constrained('sucursales')
                    ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        foreach ($this->tablas as $tabla) {
            Schema::table($tabla, function (Blueprint $table) {
                $table->dropConstrainedForeignId('sucursal_id');
            });
        }
    }
};
