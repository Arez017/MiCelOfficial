<?php

namespace App\Http\Controllers;

use App\Models\Recibo;
use App\Models\ServiceOrder;
use Illuminate\Http\Request;

class ReciboController extends Controller
{
    /**
     * GET /api/recibos
     * Un Técnico solo ve los recibos que él emitió.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Recibo::with(['orden', 'tecnico']);

        if ($user->esTecnico()) {
            $query->where('tecnico_id', $user->id);
        }

        if ($request->filled('q')) {
            $q = $request->string('q');
            $query->where(function ($sub) use ($q) {
                $sub->where('num_recibo', 'ilike', "%{$q}%")
                    ->orWhere('cliente', 'ilike', "%{$q}%");
            });
        }

        return response()->json($query->orderByDesc('id')->get());
    }

    public function show(Request $request, Recibo $recibo)
    {
        $this->assertPuedeVer($request, $recibo);

        return response()->json($recibo->load(['orden', 'tecnico']));
    }

    /**
     * POST /api/recibos
     * Reemplaza generarRecibo() — normalmente se dispara al marcar
     * una orden como "Listo" y cobrar. Puede ir ligado a una orden o suelto.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'orden_id' => ['nullable', 'exists:service_orders,id'],
            'cliente' => ['nullable', 'string', 'max:255'],
            'telefono' => ['nullable', 'string', 'max:30'],
            'equipo' => ['nullable', 'string', 'max:255'],
            'servicio' => ['nullable', 'string', 'max:255'],
            'monto' => ['nullable', 'numeric', 'min:0'],
            'pago' => ['required', 'string', 'max:50'],
            'sucursal' => ['nullable', 'string', 'max:100'],
            'obs' => ['nullable', 'string'],
            'tipo' => ['nullable', 'string', 'max:50'],
            'marcar_listo' => ['nullable', 'boolean'],
        ]);

        $user = $request->user();
        $orden = null;

        if (! empty($data['orden_id'])) {
            $orden = ServiceOrder::findOrFail($data['orden_id']);

            $existe = Recibo::where('orden_id', $orden->id)->first();
            if ($existe) {
                return response()->json([
                    'message' => 'Esta orden ya tiene un recibo emitido.',
                    'recibo' => $existe->load(['orden', 'tecnico']),
                ], 422);
            }

            $data['cliente'] = $data['cliente'] ?? $orden->client;
            $data['telefono'] = $data['telefono'] ?? $orden->phone;
            $data['equipo'] = $data['equipo'] ?? $orden->device;
            $data['servicio'] = $data['servicio'] ?? $orden->service;
            $data['monto'] = $data['monto'] ?? $orden->monto;
            $data['sucursal'] = $data['sucursal'] ?? $orden->branch;

            if ((float) $data['monto'] <= 0) {
                return response()->json([
                    'message' => 'La orden no tiene monto. Asigna el precio antes de emitir el recibo.',
                ], 422);
            }
        }

        if (empty($data['cliente']) || empty($data['equipo']) || empty($data['servicio'])) {
            return response()->json([
                'message' => 'Faltan cliente, equipo o servicio.',
            ], 422);
        }

        if (! isset($data['monto']) || (float) $data['monto'] < 0) {
            return response()->json(['message' => 'Monto inválido.'], 422);
        }

        $data['tecnico_id'] = $user->esTecnico()
            ? $user->id
            : ($orden?->tecnico_id ?? $user->id);

        $data['num_recibo'] = $this->siguienteNumero();
        $data['hora'] = now()->format('H:i');
        $data['fecha'] = now()->toDateString();
        $data['tipo'] = $data['tipo'] ?? 'Recibo de servicio técnico';
        $data['obs'] = $data['obs']
            ?? ($orden?->obs ?: 'Garantía de 30 días por el servicio realizado.');

        $recibo = Recibo::create($data);

        $marcarListo = $data['marcar_listo'] ?? true;
        if ($orden && $marcarListo) {
            $orden->update(['status' => 'listo']);
        }

        return response()->json($recibo->load(['orden', 'tecnico']), 201);
    }
    /**
     * PUT /api/recibos/{recibo}
     * Reemplaza guardarEdicionRecibo().
     */
    public function update(Request $request, Recibo $recibo)
    {
        $this->assertPuedeVer($request, $recibo);

        $data = $request->validate([
            'cliente' => ['sometimes', 'string', 'max:255'],
            'telefono' => ['nullable', 'string', 'max:30'],
            'equipo' => ['sometimes', 'string', 'max:255'],
            'servicio' => ['sometimes', 'string', 'max:255'],
            'monto' => ['sometimes', 'numeric', 'min:0'],
            'pago' => ['sometimes', 'string', 'max:50'],
            'sucursal' => ['nullable', 'string', 'max:100'],
            'obs' => ['nullable', 'string'],
        ]);

        $recibo->update($data);

        return response()->json($recibo->load(['orden', 'tecnico']));
    }
    /**
 * POST /api/orders/{order}/recibo
 * Body opcional: { "pago": "Efectivo", "obs": "..." }
 */
    public function desdeOrden(Request $request, ServiceOrder $order)
    {
        $request->merge(['orden_id' => $order->id]);

        if (! $request->filled('pago')) {
            $request->merge(['pago' => 'Efectivo']);
        }

        return $this->store($request);
    }
    
    // ===== Helpers =====

    private function assertPuedeVer(Request $request, Recibo $recibo): void
    {
        $user = $request->user();
        if ($user->esTecnico() && $recibo->tecnico_id !== $user->id) {
            abort(403, 'No puedes ver recibos de otro técnico.');
        }
    }
    private function siguienteNumero(): string
    {
        $ultimo = Recibo::orderByDesc('id')->value('id') ?? 0;

        return 'REC-' . str_pad((string) ($ultimo + 1), 4, '0', STR_PAD_LEFT);
    }

}