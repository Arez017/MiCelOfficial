<?php

namespace App\Http\Controllers;

use App\Models\ServiceOrder;
use App\Models\User;
use App\Services\ClienteFidelidadService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ServiceOrderController extends Controller
{
    private array $statusMap = [
        'Recepción'   => 'recepcion',
        'Diagnóstico' => 'diagnostico',
        'En proceso'  => 'en_proceso',
        'Listo'       => 'listo',
    ];

    public function index(Request $request)
    {
        $user = $request->user();
        $query = ServiceOrder::with(['tecnico', 'sucursal']);

        if ($user->esTecnico()) {
            $query->where('tecnico_id', $user->id);
        }

        if ($request->filled('q')) {
            $q = $request->string('q');
            $query->where(function ($sub) use ($q) {
                $sub->where('code', 'ilike', "%{$q}%")
                    ->orWhere('client', 'ilike', "%{$q}%")
                    ->orWhere('device', 'ilike', "%{$q}%");
            });
        }

        if ($request->filled('sucursal_id')) {
            $query->where('sucursal_id', $request->integer('sucursal_id'));
        }

        return response()->json(
            $query->orderByDesc('id')->get()->map(fn ($o) => $this->formatOrder($o))
        );
    }

    public function show(Request $request, ServiceOrder $order)
    {
        $this->assertPuedeVer($request, $order);

        return response()->json($this->formatOrder($order->load(['tecnico', 'sucursal'])));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'client' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'device' => ['required', 'string', 'max:255'],
            'service' => ['required', 'string', 'max:255'],
            'sucursal_id' => ['nullable', 'exists:sucursales,id'],
            'tecnico_id' => ['nullable', 'exists:users,id'],
            'monto' => ['nullable', 'numeric', 'min:0'],
            'obs' => ['nullable', 'string'],
        ]);

        $user = $request->user();
        $data['tecnico_id'] = $user->esTecnico() ? $user->id : ($data['tecnico_id'] ?? null);
        $data['code'] = $this->siguienteCodigo();
        $data['status'] = 'recepcion';
        $data['monto'] = $data['monto'] ?? 0;

        $orden = ServiceOrder::create($data);

        return response()->json($this->formatOrder($orden->load(['tecnico', 'sucursal'])), 201);
    }

    /**
     * PUT /api/orders/{order}
     * Reemplaza guardarEdicionOrden() — edición completa.
     */
    public function update(Request $request, ServiceOrder $order)
    {
        $this->assertPuedeEditar($request, $order);

        $data = $request->validate([
            'client' => ['sometimes', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'device' => ['sometimes', 'string', 'max:255'],
            'service' => ['sometimes', 'string', 'max:255'],
            'tecnico_id' => ['sometimes', 'nullable', 'exists:users,id'],
            'monto' => ['sometimes', 'numeric', 'min:0'],
            'obs' => ['nullable', 'string'],
            'status' => ['sometimes', 'in:recepcion,diagnostico,en_proceso,listo'],
        ]);

        $estabaListo = $order->status === 'listo';
        $order->update($data);

        $this->acreditarSiQuedoLista($order, $estabaListo);

        return response()->json($this->formatOrder($order->load(['tecnico', 'sucursal'])));
    }

    /**
     * PATCH /api/orders/{order}/estado
     * Reemplaza cambiarEstado()/guardarEstado() — cambio rápido de estado.
     */
    public function cambiarEstado(Request $request, ServiceOrder $order)
    {
        $this->assertPuedeEditar($request, $order);

        $data = $request->validate([
            'status' => ['required', 'in:recepcion,diagnostico,en_proceso,listo'],
        ]);

        $estabaListo = $order->status === 'listo';
        $order->update(['status' => $data['status']]);

        $this->acreditarSiQuedoLista($order, $estabaListo);

        return response()->json($this->formatOrder($order->load(['tecnico', 'sucursal'])));
    }

    public function reportePorTecnico(Request $request)
    {
        $user = $request->user();

        $tecnicosQuery = User::where('rol', 'tecnico')->with('sucursal');
        if ($user->esTecnico()) {
            $tecnicosQuery->where('id', $user->id);
        }

        $tecnicos = $tecnicosQuery->get();

        $reporte = $tecnicos->map(function (User $tecnico) {
            $ordenesListas = ServiceOrder::where('tecnico_id', $tecnico->id)
                ->where('status', 'listo')
                ->get();

            $ingresos = $ordenesListas->sum('monto');
            $comision = $ordenesListas->sum(fn ($o) => $o->comision);

            return [
                'tecnico_id' => $tecnico->id,
                'code' => $tecnico->code,
                'name' => $tecnico->name,
                'sucursal_id' => $tecnico->sucursal_id,
                'sucursal' => $tecnico->sucursal?->nombre,
                'ordenes_completadas' => $ordenesListas->count(),
                'ingresos' => round((float) $ingresos, 2),
                'comision' => round((float) $comision, 2),
            ];
        });

        return response()->json($reporte->values());
    }

    // ===== Helpers =====

    /**
     * Acredita coins al cliente solo la PRIMERA vez que la orden llega a
     * "listo" — si ya estaba lista y se vuelve a guardar (ej. se corrige
     * una obs), no se le vuelve a acreditar el mismo monto dos veces.
     */
    private function acreditarSiQuedoLista(ServiceOrder $order, bool $estabaListoAntes): void
    {
        if (! $estabaListoAntes && $order->status === 'listo') {
            ClienteFidelidadService::registrarGasto($order->phone, (float) $order->monto);
        }
    }

    private function formatOrder(ServiceOrder $o): array
    {
        return [
            'id' => $o->id,
            'code' => $o->code,
            'client' => $o->client,
            'phone' => $o->phone,
            'device' => $o->device,
            'service' => $o->service,
            'sucursal_id' => $o->sucursal_id,
            'sucursal' => $o->sucursal?->nombre,
            'status' => $o->status,
            'status_label' => $o->status_label,
            'monto' => (float) $o->monto,
            'comision' => $o->comision,
            'obs' => $o->obs,
            'tecnico' => $o->tecnico ? [
                'id' => $o->tecnico->id,
                'code' => $o->tecnico->code,
                'name' => $o->tecnico->name,
            ] : null,
            'created_at' => $o->created_at,
        ];
    }

    private function assertPuedeVer(Request $request, ServiceOrder $order): void
    {
        $user = $request->user();
        if ($user->esTecnico() && $order->tecnico_id !== $user->id) {
            abort(403, 'No puedes ver órdenes de otro técnico.');
        }
    }

    private function assertPuedeEditar(Request $request, ServiceOrder $order): void
    {
        $user = $request->user();
        if ($user->esTecnico() && $order->tecnico_id !== $user->id) {
            abort(403, 'No puedes editar órdenes de otro técnico.');
        }
    }

    private function siguienteCodigo(): string
    {
        $ultimo = ServiceOrder::orderByDesc('id')->value('id') ?? 40;
        return '#OS-00' . ($ultimo + 1);
    }
}
