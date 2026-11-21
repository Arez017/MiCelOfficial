<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Notificaciones push (Firebase Cloud Messaging): el token del celular
     * donde el cliente inició sesión en la app MiCel.
     */
    public function up(): void
    {
        Schema::table('clientes', function (Blueprint $table) {
            $table->string('fcm_token', 512)->nullable()->after('password');
            $table->timestamp('fcm_token_at')->nullable()->after('fcm_token');
        });
    }

    public function down(): void
    {
        Schema::table('clientes', function (Blueprint $table) {
            $table->dropColumn(['fcm_token', 'fcm_token_at']);
        });
    }
};
