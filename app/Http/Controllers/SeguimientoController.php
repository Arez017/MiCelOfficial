<?php

namespace App\Http\Controllers;

use App\Models\ServiceOrder;
use Illuminate\Http\Request;

class SeguimientoController extends Controller
{
    /**
     * GET /api/seguimiento/{codigo}
     * Público — cliente consulta con su código de orden.
     * Opcional: ?phone=72345678
     */
    public function show(Request $request, string $codigo)
    {
        $codigo = strtoupper(trim(urldecode($codigo)));
        if (! str_starts_with($codigo, '#')) {
            $codigo = '#' . ltrim($codigo, '#');
        }

        $query = ServiceOrder::with('tecnico:id,name,code,telefono')
            ->where('code', $codigo);

        if ($request->filled('phone')) {
            $phone = $request->string('phone')->toString();
            $query->where('phone', 'like', '%' . $phone . '%');
        }

        $orden = $query->first();

        if (! $orden) {
            return response()->json([
                'message' => 'No se encontró una orden con ese código.',
            ], 404);
        }

        return response()->json([
            'code' => $orden->code,
            'client' => $orden->client,
            'device' => $orden->device,
            'service' => $orden->service,
            'status' => $orden->status,
            'status_label' => $orden->status_label,
            'branch' => $orden->branch,
            'monto' => (float) $orden->monto,
            'obs' => $orden->obs,
            'tecnico' => $orden->tecnico ? [
                'name' => $orden->tecnico->name,
                'code' => $orden->tecnico->code,
            ] : null,
            'updated_at' => $orden->updated_at?->toIso8601String(),
        ]);
    }
}