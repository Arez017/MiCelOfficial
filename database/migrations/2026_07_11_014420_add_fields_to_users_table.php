<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('code')->unique()->after('id');
            $table->string('username')->unique()->after('code');
            $table->enum('rol', ['superadmin', 'administrador', 'tecnico'])->default('tecnico')->after('username');
            $table->string('branch')->nullable()->after('rol');
            $table->boolean('active')->default(true)->after('branch');
            $table->string('telefono')->nullable()->after('active');
            $table->string('foto_path')->nullable()->after('telefono');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['code', 'username', 'rol', 'branch', 'active', 'telefono', 'foto_path']);
        });
    }
};