<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Columna de texto libre por tabla: nombre de tabla => nombre de columna vieja.
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
        // 1) Recolectar todos los valores distintos (sin vacíos), normalizando
        //    espacios para no crear "La Paz" y "La Paz " como sucursales separadas.
        $nombres = collect();

        foreach ($this->columnas as $tabla => $columna) {
            DB::table($tabla)
                ->whereNotNull($columna)
                ->where($columna, '!=', '')
                ->distinct()
                ->pluck($columna)
                ->each(function ($valor) use ($nombres) {
                    $nombres->push(trim($valor));
                });
        }

        // Agrupar ignorando mayúsculas/minúsculas para no duplicar
        // "El Alto" y "el alto" como sucursales distintas.
        $nombresUnicos = $nombres
            ->unique()
            ->groupBy(fn ($n) => Str::lower($n))
            ->map(fn ($grupo) => $grupo->first()); // se queda con la primera variante de mayúsculas encontrada

        // 2) Crear (o reutilizar) el registro en sucursales para cada nombre único.
        $idsPorNombre = []; // clave: nombre en minúsculas -> id de sucursal
        foreach ($nombresUnicos as $clave => $nombre) {
            $id = DB::table('sucursales')->where('nombre', $nombre)->value('id');
            if (! $id) {
                $id = DB::table('sucursales')->insertGetId([
                    'nombre' => $nombre,
                    'activa' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            $idsPorNombre[$clave] = $id;
        }

        // 3) Actualizar sucursal_id en cada tabla según el valor de texto que tenía.
        foreach ($this->columnas as $tabla => $columna) {
            $filas = DB::table($tabla)
                ->whereNotNull($columna)
                ->where($columna, '!=', '')
                ->select('id', $columna)
                ->get();

            foreach ($filas as $fila) {
                $clave = Str::lower(trim($fila->$columna));
                if (isset($idsPorNombre[$clave])) {
                    DB::table($tabla)
                        ->where('id', $fila->id)
                        ->update(['sucursal_id' => $idsPorNombre[$clave]]);
                }
            }
        }
    }

    public function down(): void
    {
        // No se revierte: dejar sucursal_id en null otra vez sería perder
        // información sin poder reconstruir el string original con certeza.
        // Si necesitas deshacer, restaura desde un backup previo a esta migración.
    }
};
