<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Cierre de la migración a sucursales normalizadas: ya se creó la tabla
     * `sucursales`, se agregó `sucursal_id` en las 6 tablas, se migraron los
     * datos existentes y se actualizaron todos los controladores (Cliente,
     * ServiceOrder, User, Recibo, CelularInventario, CelularVenta, Auth,
     * Profile) para leer/escribir sucursal_id en vez del texto libre.
     *
     * Aplica esta migración solo DESPUÉS de haber desplegado esos cambios
     * de controladores (y de haber actualizado la app Flutter para dejar
     * de mandar/leer el campo de texto). Si la corres antes de tiempo,
     * cualquier request viejo que todavía mande "branch"/"sucursal" como
     * string simplemente lo ignorará (Laravel tira los campos no fillable),
     * en vez de fallar, pero es mejor no dejarlo a medias.
     */
    private array $columnas = [
        'users' => 'branch',
        'clientes' => 'branch',
        'service_orders' => 'branch',
        'recibos' => 'sucursal',
        'celulares_inventario' => 'sucursal',
        'celulares_ventas' => 'sucursal',
    ];

    public function up(): void
    {
        foreach ($this->columnas as $tabla => $columna) {
            Schema::table($tabla, function (Blueprint $table) use ($columna) {
                $table->dropColumn($columna);
            });
        }
    }

    public function down(): void
    {
        foreach ($this->columnas as $tabla => $columna) {
            Schema::table($tabla, function (Blueprint $table) use ($columna) {
                $table->string($columna)->nullable();
            });
        }
        // Nota: el down() recrea la columna vacía; no restaura los valores de
        // texto originales (esa información solo vive en sucursal_id -> sucursales.nombre).
    }
};
