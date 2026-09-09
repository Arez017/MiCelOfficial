<?php

namespace App\Http\Controllers;

use App\Models\ServiceOrder;
use App\Models\User;
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

    /**
     * GET /api/orders
     * Reemplaza renderOrders(ordersData) + filterOrders()/filterSucursal().
     * - Admin/SuperAdmin ven todas.
     * - Técnico solo ve las suyas (equivalente a "Mis órdenes").
     * Soporta ?q= y ?branch=
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = ServiceOrder::with('tecnico');

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

        if ($request->filled('branch') && $request->branch !== 'all') {
            $query->where('branch', 'like', "%{$request->branch}%");
        }

        return response()->json(
            $query->orderByDesc('id')->get()->map(fn ($o) => $this->formatOrder($o))
        );
    }

    public function show(Request $request, ServiceOrder $order)
    {
        $this->assertPuedeVer($request, $order);

        return response()->json($this->formatOrder($order->load('tecnico')));
    }

    /**
     * POST /api/orders
     * Reemplaza guardarOrden(). Si el que crea es Técnico, se autoasigna
     * (igual que tu lógica: currentUser.rol === 'Técnico' ? currentUser.techCode : techCode).
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'client' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'device' => ['required', 'string', 'max:255'],
            'service' => ['required', 'string', 'max:255'],
            'branch' => ['nullable', 'string', 'max:100'],
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

        return response()->json($this->formatOrder($orden->load('tecnico')), 201);
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

        $order->update($data);

        return response()->json($this->formatOrder($order->load('tecnico')));
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

        $order->update(['status' => $data['status']]);

        return response()->json($this->formatOrder($order->load('tecnico')));
    }

    /**
     * GET /api/reportes/tecnicos
     * Reemplaza el array fijo `reporteTecnicos` de app.js — ahora calculado
     * en tiempo real a partir de las órdenes reales.
     * - Admin/SuperAdmin: ve todos los técnicos.
     * - Técnico: solo ve su propia fila (para "Mi comisión").
     */
    public function reportePorTecnico(Request $request)
    {
        $user = $request->user();

        $tecnicosQuery = User::where('rol', 'tecnico');
        if ($user->esTecnico()) {
            $tecnicosQuery->where('id', $user->id);
        }

        $tecnicos = $tecnicosQuery->get();

        $reporte = $tecnicos->map(function (User $tecnico) {
            $ordenesListas = ServiceOrder::where('tecnico_id', $tecnico->id)
                ->where('status', 'listo')
                ->get();

            $ingresos = $ordenesListas->sum('monto');
            $comision = $ordenesListas->sum(fn ($o) => $o->comision); // 15% via accessor

            return [
                'tecnico_id' => $tecnico->id,
                'code' => $tecnico->code,
                'name' => $tecnico->name,
                'branch' => $tecnico->branch,
                'ordenes_completadas' => $ordenesListas->count(),
                'ingresos' => round((float) $ingresos, 2),
                'comision' => round((float) $comision, 2),
            ];
        });

        return response()->json($reporte->values());
    }

    // ===== Helpers =====

    private function formatOrder(ServiceOrder $o): array
    {
        return [
            'id' => $o->id,
            'code' => $o->code,
            'client' => $o->client,
            'phone' => $o->phone,
            'device' => $o->device,
            'service' => $o->service,
            'branch' => $o->branch,
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