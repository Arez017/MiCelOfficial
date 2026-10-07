<?php

namespace App\Http\Controllers;

use App\Models\Sucursal;
use Illuminate\Http\Request;

class SucursalController extends Controller
{
    /**
     * GET /api/sucursales
     * Cualquier usuario logueado puede listarlas (las necesita para los
     * selects de la app: registrar venta, orden de servicio, etc.).
     * ?solo_activas=1 filtra las dadas de baja.
     */
    public function index(Request $request)
    {
        $query = Sucursal::query();

        if ($request->boolean('solo_activas')) {
            $query->where('activa', true);
        }

        return response()->json($query->orderBy('nombre')->get());
    }

    public function show(Sucursal $sucursal)
    {
        return response()->json($sucursal);
    }

    /**
     * POST /api/sucursales
     * Solo Admin/SuperAdmin puede crear sucursales nuevas.
     */
    public function store(Request $request)
    {
        $this->assertEsAdmin($request);

        $data = $request->validate([
            'nombre' => ['required', 'string', 'max:255', 'unique:sucursales,nombre'],
            'direccion' => ['nullable', 'string', 'max:255'],
            'telefono' => ['nullable', 'string', 'max:30'],
        ]);

        $sucursal = Sucursal::create($data);

        return response()->json($sucursal, 201);
    }

    public function update(Request $request, Sucursal $sucursal)
    {
        $this->assertEsAdmin($request);

        $data = $request->validate([
            'nombre' => ['sometimes', 'string', 'max:255', 'unique:sucursales,nombre,' . $sucursal->id],
            'direccion' => ['nullable', 'string', 'max:255'],
            'telefono' => ['nullable', 'string', 'max:30'],
        ]);

        $sucursal->update($data);

        return response()->json($sucursal);
    }

    /**
     * PATCH /api/sucursales/{sucursal}/activa
     * Dar de baja/alta una sucursal sin borrarla (evita romper el historial
     * de ventas/órdenes que ya la referencian por sucursal_id).
     */
    public function toggleActiva(Request $request, Sucursal $sucursal)
    {
        $this->assertEsAdmin($request);

        $sucursal->update(['activa' => ! $sucursal->activa]);

        return response()->json($sucursal);
    }

    /**
     * DELETE /api/sucursales/{sucursal}
     * Solo permite borrar si NO tiene nada asociado todavía (por seguridad,
     * mejor desactivarla con toggleActiva que borrarla una vez que ya se usó).
     */
    public function destroy(Request $request, Sucursal $sucursal)
    {
        $this->assertEsAdmin($request);

        $tieneUso = $sucursal->usuarios()->exists()
            || $sucursal->clientes()->exists()
            || $sucursal->serviceOrders()->exists()
            || $sucursal->recibos()->exists()
            || $sucursal->celularesInventario()->exists()
            || $sucursal->celularesVentas()->exists();

        if ($tieneUso) {
            return response()->json([
                'message' => 'No se puede eliminar: la sucursal ya tiene registros asociados. Desactívala en su lugar.',
            ], 422);
        }

        $sucursal->delete();

        return response()->json(['message' => 'Sucursal eliminada.']);
    }

    private function assertEsAdmin(Request $request): void
    {
        if (! $request->user()->esAdministrador()) {
            abort(403, 'Solo un administrador puede modificar sucursales.');
        }
    }
}
