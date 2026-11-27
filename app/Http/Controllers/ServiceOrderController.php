<?php

namespace App\Http\Controllers;

use App\Models\Cliente;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Services\ClienteFidelidadService;
use App\Support\ClientePhone;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ServiceOrderController extends Controller
{
    private array $statusMap = [
        'Recepción' => 'recepcion',
        'Diagnóstico' => 'diagnostico',
        'En proceso' => 'en_proceso',
        'Listo' => 'listo',
    ];

    public function index(Request $request)
    {
        $user = $request->user();
        $query = ServiceOrder::with(['tecnico', 'sucursal', 'cliente']);

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

        return response()->json($this->formatOrder($order->load(['tecnico', 'sucursal', 'cliente'])));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'client' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'cliente_id' => ['nullable', 'exists:clientes,id'],
            'cliente_decision' => ['nullable', 'in:existente,nuevo'],
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

        $decision = $data['cliente_decision'] ?? null;
        unset($data['cliente_decision']);

        // Si el teléfono ya es de otro cliente con otro nombre, no se juntan a
        // ciegas: la web pregunta si es la misma persona o un cliente nuevo.
        if (empty($data['cliente_id']) && $decision === null && ! empty($data['phone'])) {
            $porTelefono = ClientePhone::findByPhone($data['phone']);
            if ($porTelefono && ! $this->mismoNombre($porTelefono->name, $data['client'])) {
                return response()->json([
                    'message' => "Este teléfono ya está registrado a nombre de {$porTelefono->name}.",
                    'conflicto_cliente' => [
                        'id' => $porTelefono->id,
                        'code' => $porTelefono->code,
                        'name' => $porTelefono->name,
                    ],
                ], 409);
            }
        }

        // Crear o vincular cliente automáticamente
        $cliente = $decision === 'nuevo'
            ? $this->crearCliente($data['client'], $data['phone'] ?? null, $data['sucursal_id'] ?? null)
            : $this->resolverOCrearCliente(
                $data['cliente_id'] ?? null,
                $data['client'],
                $data['phone'] ?? null,
                $data['sucursal_id'] ?? null
            );
        if ($cliente && $decision === 'existente') {
            $data['client'] = $cliente->name;
        }
        if ($cliente) {
            $data['cliente_id'] = $cliente->id;
            if (empty($data['phone']) && $cliente->phone) {
                $data['phone'] = $cliente->phone;
            }
        }

        $orden = ServiceOrder::create($data);

        $respuesta = $this->formatOrder($orden->load(['tecnico', 'sucursal', 'cliente']));
        if (! $cliente) {
            // Antes esto solo quedaba en el log y nadie se enteraba.
            $respuesta['aviso'] = 'La orden se guardó, pero no se pudo crear la ficha del cliente. Créala desde Clientes.';
        }

        return response()->json($respuesta, 201);
    }

    public function update(Request $request, ServiceOrder $order)
    {
        $this->assertPuedeEditar($request, $order);

        $data = $request->validate([
            'client' => ['sometimes', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'cliente_id' => ['nullable', 'exists:clientes,id'],
            'device' => ['sometimes', 'string', 'max:255'],
            'service' => ['sometimes', 'string', 'max:255'],
            'tecnico_id' => ['sometimes', 'nullable', 'exists:users,id'],
            'sucursal_id' => ['sometimes', 'nullable', 'exists:sucursales,id'],
            'monto' => ['sometimes', 'numeric', 'min:0'],
            'obs' => ['nullable', 'string'],
            'status' => ['sometimes', 'in:recepcion,diagnostico,en_proceso,listo'],
        ]);

        $estabaListo = $order->status === 'listo';
        $order->update($data);

        // Si aún no tiene cliente_id, intentar vincular/crear
        if (! $order->cliente_id) {
            $cliente = $this->resolverOCrearCliente(
                null,
                $order->client,
                $order->phone,
                $order->sucursal_id
            );
            if ($cliente) {
                $order->update(['cliente_id' => $cliente->id]);
            }
        }

        $this->acreditarSiQuedoLista($order->fresh(), $estabaListo);

        return response()->json($this->formatOrder($order->load(['tecnico', 'sucursal', 'cliente'])));
    }

    public function cambiarEstado(Request $request, ServiceOrder $order)
    {
        $this->assertPuedeEditar($request, $order);

        $data = $request->validate([
            'status' => ['required', 'in:recepcion,diagnostico,en_proceso,listo'],
        ]);

        $estabaListo = $order->status === 'listo';
        $order->update(['status' => $data['status']]);

        if (! $order->cliente_id) {
            $cliente = $this->resolverOCrearCliente(
                null,
                $order->client,
                $order->phone,
                $order->sucursal_id
            );
            if ($cliente) {
                $order->update(['cliente_id' => $cliente->id]);
            }
        }

        $this->acreditarSiQuedoLista($order->fresh(), $estabaListo);

        return response()->json($this->formatOrder($order->load(['tecnico', 'sucursal', 'cliente'])));
    }

    public function reportePorTecnico(Request $request)
    {
        $user = $request->user();
        $tecnicosQuery = User::whereIn('rol', ['tecnico', 'administrador', 'superadmin'])->with('sucursal');
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

    /**
     * Solo la PRIMERA vez que queda en "listo".
     */
    private function acreditarSiQuedoLista(ServiceOrder $order, bool $estabaListoAntes): void
    {
        if ($estabaListoAntes || $order->status !== 'listo') {
            return;
        }

        // Resolver cliente de forma robusta (id → teléfono normalizado → nombre → crear)
        $cliente = null;
        if ($order->cliente_id) {
            $cliente = Cliente::find($order->cliente_id);
        }
        if (! $cliente && $order->phone) {
            $cliente = ClientePhone::findByPhone($order->phone);
        }
        if (! $cliente && $order->client) {
            $cliente = Cliente::whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower(trim($order->client))])->first();
        }
        if (! $cliente) {
            $cliente = $this->resolverOCrearCliente(
                null,
                $order->client ?: 'Cliente',
                $order->phone,
                $order->sucursal_id
            );
        }

        if ($cliente) {
            if ((int) $order->cliente_id !== (int) $cliente->id) {
                $order->cliente_id = $cliente->id;
                $order->save();
            }
            // +1 visita por reparación completada
            $cliente->visits = (int) $cliente->visits + 1;
            $cliente->last_visit = now();
            $cliente->save();
        }

        $monto = (float) $order->monto;
        if ($monto <= 0) {
            return;
        }

        ClienteFidelidadService::registrarGasto(
            $cliente?->id ?? $order->cliente_id,
            $order->phone,
            $monto
        );
    }

    /**
     * Busca cliente por id / teléfono / nombre; si no existe, lo crea.
     */
    private function resolverOCrearCliente(?int $clienteId, string $nombre, ?string $phone, $sucursalId): ?Cliente
    {
        // 1) por id
        if ($clienteId) {
            $c = Cliente::find($clienteId);
            if ($c) {
                return $c;
            }
        }

        // 2) por teléfono normalizado
        $phoneNorm = $phone ? preg_replace('/\D+/', '', $phone) : '';
        if ($phoneNorm !== '') {
            $porTel = ClientePhone::findByPhone($phone);
            if ($porTel) {
                return $porTel;
            }
        }

        // 3) por nombre exacto (solo si no hay teléfono que cree uno nuevo)
        $porNombre = Cliente::whereRaw('LOWER(name) = ?', [mb_strtolower(trim($nombre))])->first();
        if ($porNombre && $phoneNorm === '') {
            return $porNombre;
        }
        if ($porNombre && $phoneNorm !== '' && empty($porNombre->phone)) {
            $porNombre->update(['phone' => $phone]);

            return $porNombre;
        }

        // 4) crear ficha nueva
        return $this->crearCliente($nombre, $phone, $sucursalId);
    }

    private function crearCliente(string $nombre, ?string $phone, $sucursalId): ?Cliente
    {
        $phoneNorm = $phone ? preg_replace('/\D+/', '', $phone) : '';

        $payload = [
            'code' => Cliente::siguienteCodigo(),
            'name' => trim($nombre),
            'sucursal_id' => $sucursalId,
            'visits' => 1,
            'last_visit' => now(),
            'active' => true,
            'coins' => 0,
            'total_gastado' => 0,
            'es_vip' => false,
        ];

        // Si hay teléfono, lo guardamos; si no, intentamos null (columna nullable)
        // o un marcador temporal para no romper NOT NULL en instalaciones viejas
        if ($phoneNorm !== '') {
            $payload['phone'] = $phone;
        } else {
            $payload['phone'] = 'S/N'; // temporal si la columna sigue NOT NULL
        }

        try {
            return Cliente::create($payload);
        } catch (\Throwable $e) {
            // Último recurso: no romper la orden si falla el alta de cliente
            \Log::warning('No se pudo auto-crear cliente: '.$e->getMessage());

            return null;
        }
    }

    /** «Egor Kamado» y «egor  kamado» son el mismo nombre; «Huan Pérez» no. */
    private function mismoNombre(?string $a, ?string $b): bool
    {
        $normalizar = fn (?string $t) => preg_replace('/\s+/', ' ', trim(mb_strtolower(Str::ascii((string) $t))));

        return $normalizar($a) === $normalizar($b);
    }

    private function formatOrder(ServiceOrder $o): array
    {
        return [
            'id' => $o->id,
            'code' => $o->code,
            'client' => $o->client,
            'phone' => $o->phone,
            'cliente_id' => $o->cliente_id,
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

        return '#OS-'.str_pad((string) ($ultimo + 1), 4, '0', STR_PAD_LEFT);
    }
}
