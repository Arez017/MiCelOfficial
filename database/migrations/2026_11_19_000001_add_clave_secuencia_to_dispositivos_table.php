<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * CuotaLock v3: cada equipo tiene su propia clave (cifrada con APP_KEY) y un
     * contador de emisiones para que cada código sea distinto y de un solo uso.
     */
    public function up(): void
    {
        Schema::table('dispositivos', function (Blueprint $table) {
            $table->text('clave')->nullable()->after('device_id');
            $table->unsignedInteger('secuencia')->default(0)->after('clave');
        });
    }

    public function down(): void
    {
        Schema::table('dispositivos', function (Blueprint $table) {
            $table->dropColumn(['clave', 'secuencia']);
        });
    }
};
