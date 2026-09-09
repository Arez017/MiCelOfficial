<?php

namespace App\Http\Controllers;

use App\Models\Venta;
use Illuminate\Http\Request;

class VentaController extends Controller
{
    /**
     * GET /api/ventas
     * Reemplaza renderVentasHoy(ventasHoy). Por defecto trae las de HOY;
     * usa ?fecha=YYYY-MM-DD para consultar otro día, o ?all=1 para todas.
     * Un Técnico solo ve sus propias ventas.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Venta::with('tecnico');

        if ($user->esTecnico()) {
            $query->where('tecnico_id', $user->id);
        }

        if (! $request->boolean('all')) {
            $fecha = $request->filled('fecha') ? $request->date('fecha') : now();
            $query->whereDate('created_at', $fecha);
        }

        return response()->json(
            $query->orderByDesc('id')->get()->map(fn ($v) => [
                'id' => $v->id,
                'hora' => $v->hora,
                'client' => $v->client,
                'detail' => $v->detail,
                'monto' => (float) $v->monto,
                'pago' => $v->pago,
                'tecnico' => $v->tecnico ? ['id' => $v->tecnico->id, 'code' => $v->tecnico->code, 'name' => $v->tecnico->name] : null,
                'fecha' => $v->created_at->toDateString(),
            ])
        );
    }

    /**
     * POST /api/ventas
     * Cualquier usuario logueado (admin o técnico) puede registrar una venta.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'client' => ['nullable', 'string', 'max:255'],
            'detail' => ['required', 'string', 'max:255'],
            'monto' => ['required', 'numeric', 'min:0'],
            'pago' => ['required', 'in:efectivo,qr'],
        ]);

        $user = $request->user();
        $data['tecnico_id'] = $user->id;
        $data['hora'] = now()->format('H:i');

        $venta = Venta::create($data);

        return response()->json($venta->load('tecnico'), 201);
    }

    /** GET /api/ventas/resumen — total del día, para el dashboard/metric-card */
    public function resumenHoy(Request $request)
    {
        $user = $request->user();
        $query = Venta::whereDate('created_at', now());

        if ($user->esTecnico()) {
            $query->where('tecnico_id', $user->id);
        }

        return response()->json([
            'total' => (float) $query->sum('monto'),
            'cantidad' => $query->count(),
        ]);
    }
}