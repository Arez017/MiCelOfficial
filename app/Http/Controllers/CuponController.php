<?php

namespace App\Http\Controllers;

use App\Models\Cupon;
use Illuminate\Http\Request;

class CuponController extends Controller
{
    /** GET /api/cupones — vista de staff, incluye inactivos/vencidos */
    public function index(Request $request)
    {
        $this->assertEsAdmin($request);

        return response()->json(Cupon::orderByDesc('id')->get());
    }

    public function store(Request $request)
    {
        $this->assertEsAdmin($request);

        $data = $this->validarDatos($request);
        $cupon = Cupon::create($data);

        return response()->json($cupon, 201);
    }

    public function update(Request $request, Cupon $cupon)
    {
        $this->assertEsAdmin($request);

        $data = $this->validarDatos($request, $cupon->id);
        $cupon->update($data);

        return response()->json($cupon);
    }

    public function destroy(Request $request, Cupon $cupon)
    {
        $this->assertEsAdmin($request);
        $cupon->delete();

        return response()->json(['message' => 'Cupón eliminado.']);
    }

    private function validarDatos(Request $request, ?int $ignorarId = null): array
    {
        return $request->validate([
            'titulo' => ['required', 'string', 'max:255'],
            'descripcion' => ['nullable', 'string'],
            'codigo' => ['required', 'string', 'max:50', 'unique:cupones,codigo,' . $ignorarId],
            'descuento_tipo' => ['required', 'in:porcentaje,monto_fijo'],
            'descuento_valor' => ['required', 'numeric', 'min:0'],
            'solo_vip' => ['sometimes', 'boolean'],
            'fecha_vencimiento' => ['nullable', 'date'],
            'activo' => ['sometimes', 'boolean'],
        ]);
    }

    private function assertEsAdmin(Request $request): void
    {
        if (! $request->user()->esAdministrador()) {
            abort(403, 'Solo un administrador puede gestionar cupones.');
        }
    }
}
