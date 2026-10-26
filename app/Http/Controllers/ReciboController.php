<?php

namespace App\Http\Controllers;

use App\Models\Recibo;
use App\Models\ServiceOrder;
use Carbon\Carbon;
use Illuminate\Http\Request;

class ReciboController extends Controller
{
    /** Hora Bolivia (El Alto / La Paz) */
    private function ahoraBO(): Carbon
    {
        return Carbon::now('America/La_Paz');
    }

    public function index(Request $request)
    {
        $user = $request->user();
        $query = Recibo::with(['orden', 'tecnico', 'sucursal']);

        if (method_exists($user, 'esTecnico') && $user->esTecnico()) {
            $query->where('tecnico_id', $user->id);
        }

        if ($request->filled('q')) {
            $q = $request->string('q');
            $query->where(function ($sub) use ($q) {
                $sub->where('num_recibo', 'ilike', "%{$q}%")
                    ->orWhere('cliente', 'ilike', "%{$q}%");
            });
        }

        return response()->json(
            $query->orderByDesc('id')->get()->map(fn ($r) => $this->formatRecibo($r))
        );
    }

    public function show(Request $request, Recibo $recibo)
    {
        $this->assertPuedeVer($request, $recibo);

        return response()->json($this->formatRecibo($recibo->load(['orden', 'tecnico', 'sucursal'])));
    }

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
            'sucursal_id' => ['nullable', 'exists:sucursales,id'],
            'obs' => ['nullable', 'string'],
            'tipo' => ['nullable', 'string', 'max:50'],
        ]);

        $user = $request->user();
        $ahora = $this->ahoraBO();

        $data['tecnico_id'] = $user->id;
        $data['num_recibo'] = $this->siguienteNumero();
        $data['hora'] = $ahora->format('H:i');       // ej. 19:30 hora Bolivia
        $data['fecha'] = $ahora->toDateString();     // ej. 2026-10-25

        if (! empty($data['orden_id'])) {
            ServiceOrder::where('id', $data['orden_id'])->update(['status' => 'listo']);
        }

        $recibo = Recibo::create($data);

        return response()->json($this->formatRecibo($recibo->load(['orden', 'tecnico', 'sucursal'])), 201);
    }

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
            'sucursal_id' => ['nullable', 'exists:sucursales,id'],
            'obs' => ['nullable', 'string'],
        ]);

        $recibo->update($data);

        return response()->json($this->formatRecibo($recibo->load(['orden', 'tecnico', 'sucursal'])));
    }

    public function destroy(Request $request, Recibo $recibo)
    {
        $this->assertPuedeVer($request, $recibo);
        $recibo->delete();

        return response()->json(['ok' => true]);
    }

    private function formatRecibo(Recibo $r): array
    {
        // Normalizar fecha por si viene cast a datetime ISO
        $fecha = $r->fecha;
        if ($fecha instanceof \DateTimeInterface) {
            $fecha = Carbon::instance($fecha)->timezone('America/La_Paz')->toDateString();
        } elseif (is_string($fecha) && str_contains($fecha, 'T')) {
            try {
                $fecha = Carbon::parse($fecha)->timezone('America/La_Paz')->toDateString();
            } catch (\Throwable $e) {
                $fecha = substr($fecha, 0, 10);
            }
        }

        $hora = $r->hora;
        if (is_string($hora) && strlen($hora) > 5) {
            // "19:30:00" → "19:30"
            $hora = substr($hora, 0, 5);
        }

        return [
            'id' => $r->id,
            'num_recibo' => $r->num_recibo,
            'orden_id' => $r->orden_id,
            'cliente' => $r->cliente,
            'telefono' => $r->telefono,
            'equipo' => $r->equipo,
            'servicio' => $r->servicio,
            'monto' => (float) $r->monto,
            'pago' => $r->pago,
            'tecnico_id' => $r->tecnico_id,
            'sucursal_id' => $r->sucursal_id,
            'obs' => $r->obs,
            'tipo' => $r->tipo,
            'fecha' => $fecha,
            'hora' => $hora,
            'orden' => $r->relationLoaded('orden') ? $r->orden : null,
            'tecnico' => $r->relationLoaded('tecnico') ? $r->tecnico : null,
            'sucursal' => $r->relationLoaded('sucursal') ? $r->sucursal : null,
        ];
    }

    private function assertPuedeVer(Request $request, Recibo $recibo): void
    {
        $user = $request->user();
        if (method_exists($user, 'esTecnico') && $user->esTecnico() && (int) $recibo->tecnico_id !== (int) $user->id) {
            abort(403, 'No puedes ver este recibo.');
        }
    }

    private function siguienteNumero(): string
    {
        $ultimo = Recibo::orderByDesc('id')->value('id') ?? 0;

        return 'REC-'.str_pad((string) ($ultimo + 1), 4, '0', STR_PAD_LEFT);
    }
}
