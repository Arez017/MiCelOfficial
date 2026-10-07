<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Refuerza a nivel de base de datos la regla de negocio "máximo 15 cuotas"
     * que hasta ahora solo se validaba en CelularVentaController. Esto evita
     * que un insert directo, un seeder mal hecho o un futuro endpoint sin
     * validación dejen guardar un plan con 0 o más de 15 cuotas.
     */
    public function up(): void
    {
        DB::statement(
            'ALTER TABLE planes_pago
             ADD CONSTRAINT chk_planes_pago_numero_cuotas
             CHECK (numero_cuotas > 0 AND numero_cuotas <= 15)'
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE planes_pago DROP CONSTRAINT chk_planes_pago_numero_cuotas');
    }
};
