<?php

namespace App\Http\Controllers;

use App\Models\CelularInventario;
use Illuminate\Http\Request;

class CelularInventarioController extends Controller
{
    /**
     * GET /api/celulares/inventario
     * Por defecto solo trae los DISPONIBLES (no vendidos). Usa ?all=1 para traer todo.
     */
    public function index(Request $request)
    {
        $query = CelularInventario::query();

        if (! $request->boolean('all')) {
            $query->where('vendido', false);
        }

        if ($request->filled('q')) {
            $q = $request->string('q');
            $query->where(function ($sub) use ($q) {
                $sub->where('modelo', 'ilike', "%{$q}%")
                    ->orWhere('imei', 'ilike', "%{$q}%");
            });
        }

        return response()->json($query->orderByDesc('id')->get());
    }

    /**
     * POST /api/celulares/inventario
     * Reemplaza agregarInventarioCelular() del MVP.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'modelo' => ['required', 'string', 'max:255'],
            'imei' => ['required', 'string', 'min:5', 'max:30', 'unique:celulares_inventario,imei'],
            'estado' => ['required', 'string', 'max:50'],
            'precio_compra' => ['required', 'numeric', 'min:0.01'],
            'sucursal' => ['nullable', 'string', 'max:100'],
        ], [
            'imei.unique' => 'Ya existe un equipo registrado con ese IMEI en el inventario.',
            'precio_compra.min' => 'El precio de compra debe ser mayor a 0.',
        ]);

        $data['codigo'] = $this->siguienteCodigo();
        $data['vendido'] = false;

        $equipo = CelularInventario::create($data);

        return response()->json($equipo, 201);
    }

    private function siguienteCodigo(): string
    {
        $ultimo = CelularInventario::orderByDesc('id')->value('id') ?? 0;
        return 'CELINV-' . str_pad((string) ($ultimo + 1), 3, '0', STR_PAD_LEFT);
    }
}