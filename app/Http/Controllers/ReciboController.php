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
            'cliente' => ['required', 'string', 'max:255'],
            'telefono' => ['nullable', 'string', 'max:30'],
            'equipo' => ['required', 'string', 'max:255'],
            'servicio' => ['required', 'string', 'max:255'],
            'monto' => ['required', 'numeric', 'min:0'],
            'pago' => ['required', 'string', 'max:50'],
            'sucursal' => ['nullable', 'string', 'max:100'],
            'obs' => ['nullable', 'string'],
            'tipo' => ['nullable', 'string', 'max:50'],
        ]);

        $user = $request->user();
        $data['tecnico_id'] = $user->id;
        $data['num_recibo'] = $this->siguienteNumero();
        $data['hora'] = now()->format('H:i');
        $data['fecha'] = now()->toDateString();

        // Si viene de una orden, la marca como pagada automáticamente
        if (! empty($data['orden_id'])) {
            ServiceOrder::where('id', $data['orden_id'])->update(['status' => 'listo']);
        }

        $recibo = Recibo::create($data);

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