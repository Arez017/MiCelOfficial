<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Habilita que un cliente tenga cuenta propia para entrar a la app móvil.
     * Son NULLABLE a propósito: la mayoría de clientes en `clientes` se crean
     * desde el mostrador (ClienteController) sin necesitar una cuenta — solo
     * se les pone username/password cuando el staff decide darles acceso
     * a la app (o cuando el cliente se autorregistra, si en el futuro se
     * habilita eso).
     */
    public function up(): void
    {
        Schema::table('clientes', function (Blueprint $table) {
            $table->string('username')->nullable()->unique()->after('phone');
            $table->string('password')->nullable()->after('username');
        });
    }

    public function down(): void
    {
        Schema::table('clientes', function (Blueprint $table) {
            $table->dropColumn(['username', 'password']);
        });
    }
};
