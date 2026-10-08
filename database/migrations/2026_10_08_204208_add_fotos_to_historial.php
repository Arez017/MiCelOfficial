
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('historial_reparaciones', function (Blueprint $table) {
            // Galería de fotos (JSON array de paths). foto_path sigue siendo la portada.
            $table->json('fotos')->nullable()->after('foto_path');
        });
    }

    public function down(): void
    {
        Schema::table('historial_reparaciones', function (Blueprint $table) {
            $table->dropColumn('fotos');
        });
    }
};