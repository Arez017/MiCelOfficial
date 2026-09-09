<?php

namespace App\Http\Controllers;

use App\Models\CelularInventario;
use App\Models\CelularVenta;
use App\Models\Cuota;
use App\Models\PlanPago;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CelularVentaController extends Controller
{
    /**
     * GET /api/celulares/ventas
     * Reemplaza renderCelulares() del MVP. Soporta ?q= para buscar.
     */
    public function index(Request $request)
    {
        $query = CelularVenta::with(['equipo', 'vendedor', 'planPago.cuotas']);

        if ($request->filled('q')) {
            $q = $request->string('q');
            $query->where('cliente', 'ilike', "%{$q}%")
                ->orWhereHas('equipo', fn ($e) => $e->where('modelo', 'ilike', "%{$q}%")->orWhere('imei', 'ilike', "%{$q}%"));
        }

        return response()->json($query->orderByDesc('id')->get());
    }

    public function show(CelularVenta $venta)
    {
        return response()->json($venta->load(['equipo', 'vendedor', 'planPago.cuotas']));
    }

    /**
     * GET /api/celulares/resumen
     * Reemplaza los 4 metric-cards del MVP (vendidos, ingresos, ganancia, en inventario).
     */
    public function resumen()
    {
        $ventas = CelularVenta::with('equipo')->get();

        return response()->json([
            'vendidos' => $ventas->count(),
            'ingresos' => round((float) $ventas->sum('precio_venta'), 2),
            'ganancia' => round($ventas->sum(fn ($v) => $v->ganancia), 2),
            'en_inventario' => CelularInventario::where('vendido', false)->count(),
        ]);
    }

    /**
     * POST /api/celulares/ventas
     * Reemplaza registrarVentaCelular() del MVP: valida el equipo, arma el
     * plan de cuotas si aplica (con documentos y tope de 15), y todo dentro
     * de una transacción para no dejar datos a medias.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'celular_inventario_id' => ['required', 'exists:celulares_inventario,id'],
            'cliente' => ['required', 'string', 'max:255'],
            'telefono' => ['nullable', 'string', 'max:30'],
            'precio_venta' => ['required', 'numeric', 'min:0.01'],
            'metodo_pago' => ['required', 'in:efectivo,qr,transferencia,cuotas'],
            'confirmar_perdida' => ['sometimes', 'boolean'],
            'inicial' => ['nullable', 'numeric', 'min:0'],
            'numero_cuotas' => ['nullable', 'integer', 'min:1', 'max:15'],
            'frecuencia' => ['nullable', 'in:semanal,quincenal,mensual'],
            'doc_ci' => ['nullable', 'boolean'],
            'doc_boleta' => ['nullable', 'boolean'],
            'doc_luz' => ['nullable', 'boolean'],
            'doc_afp' => ['nullable', 'boolean'],
        ]);

        $equipo = CelularInventario::findOrFail($data['celular_inventario_id']);

        if ($equipo->vendido) {
            return response()->json(['message' => 'Este equipo ya fue vendido anteriormente.'], 422);
        }

        // Venta con pérdida: pide confirmación explícita del frontend antes de proceder
        if ($data['precio_venta'] < $equipo->precio_compra && empty($data['confirmar_perdida'])) {
            return response()->json([
                'requiere_confirmacion' => true,
                'message' => "Vas a vender \"{$equipo->modelo}\" por Bs {$data['precio_venta']}, por debajo de su precio de compra (Bs {$equipo->precio_compra}). Reenvía la petición con confirmar_perdida=true para continuar.",
            ], 409);
        }

        // Validaciones específicas del Plan Cuotas MiCel
        if ($data['metodo_pago'] === 'cuotas') {
            if (empty($data['telefono'])) {
                return response()->json(['message' => 'El teléfono/CI del cliente es obligatorio para ventas a crédito.'], 422);
            }

            $inicial = $data['inicial'] ?? 0;
            if ($inicial >= $data['precio_venta']) {
                return response()->json(['message' => 'El pago inicial no puede ser mayor o igual al precio de venta.'], 422);
            }
            if (empty($data['numero_cuotas'])) {
                return response()->json(['message' => 'El número de cuotas es obligatorio (máximo 15).'], 422);
            }

            $docsOk = ($data['doc_ci'] ?? false) && ($data['doc_boleta'] ?? false)
                && ($data['doc_luz'] ?? false) && ($data['doc_afp'] ?? false);
            if (! $docsOk) {
                return response()->json([
                    'message' => 'Debes confirmar que el cliente presentó los 4 documentos requeridos: CI, última boleta de pago, aviso de luz y extracto de AFP.',
                ], 422);
            }
        }

        $venta = DB::transaction(function () use ($data, $equipo, $request) {
            $venta = CelularVenta::create([
                'codigo' => $this->siguienteCodigoVenta(),
                'celular_inventario_id' => $equipo->id,
                'cliente' => $data['cliente'],
                'telefono' => $data['telefono'] ?? null,
                'precio_venta' => $data['precio_venta'],
                'metodo_pago' => $data['metodo_pago'],
                'sucursal' => $equipo->sucursal,
                'vendedor_id' => $request->user()->id,
            ]);

            $equipo->update(['vendido' => true]);

            if ($data['metodo_pago'] === 'cuotas') {
                $inicial = $data['inicial'] ?? 0;
                $numero = $data['numero_cuotas'];
                $frecuencia = $data['frecuencia'] ?? 'mensual';
                $saldo = $data['precio_venta'] - $inicial;

                $plan = PlanPago::create([
                    'celular_venta_id' => $venta->id,
                    'total' => $data['precio_venta'],
                    'inicial' => $inicial,
                    'saldo' => $saldo,
                    'numero_cuotas' => $numero,
                    'frecuencia' => $frecuencia,
                    'doc_ci' => true,
                    'doc_boleta' => true,
                    'doc_luz' => true,
                    'doc_afp' => true,
                ]);

                $diasPorPeriodo = match ($frecuencia) {
                    'semanal' => 7,
                    'quincenal' => 15,
                    default => 30,
                };

                $montoBase = floor(($saldo / $numero) * 100) / 100;
                $acumulado = 0;
                for ($i = 1; $i <= $numero; $i++) {
                    // La última cuota absorbe el redondeo para que la suma cuadre exacto
                    $monto = ($i === $numero) ? round($saldo - $acumulado, 2) : $montoBase;
                    $acumulado += $monto;

                    Cuota::create([
                        'plan_pago_id' => $plan->id,
                        'numero' => $i,
                        'fecha_vencimiento' => now()->addDays($diasPorPeriodo * $i),
                        'monto' => $monto,
                        'pagada' => false,
                    ]);
                }
            }

            return $venta;
        });

        return response()->json($venta->load(['equipo', 'vendedor', 'planPago.cuotas']), 201);
    }

    /**
     * PATCH /api/cuotas/{cuota}/pagar
     * Reemplaza marcarCuotaPagada() del MVP — toggle pagada/pendiente.
     */
    public function marcarCuotaPagada(Cuota $cuota)
    {
        $cuota->pagada = ! $cuota->pagada;
        $cuota->fecha_pago = $cuota->pagada ? now() : null;
        $cuota->save();

        return response()->json($cuota);
    }

    /**
     * GET /api/celulares/estado-cuenta?q=...
     * Reemplaza consultarEstadoCuenta() del MVP — busca por cliente o IMEI.
     */
    public function estadoCuenta(Request $request)
    {
        $q = $request->query('q');
        if (! $q) {
            return response()->json(['message' => 'Escribe un cliente o IMEI para consultar.'], 422);
        }

        $venta = CelularVenta::with(['equipo', 'planPago.cuotas'])
            ->whereHas('planPago')
            ->where(function ($sub) use ($q) {
                $sub->where('cliente', 'ilike', "%{$q}%")
                    ->orWhereHas('equipo', fn ($e) => $e->where('imei', 'ilike', "%{$q}%"));
            })
            ->first();

        if (! $venta) {
            return response()->json(['message' => 'No se encontró ninguna venta a crédito activa con esos datos.'], 404);
        }

        $pendientes = $venta->planPago->cuotas->where('pagada', false)->values();

        return response()->json([
            'venta' => $venta,
            'saldo_pendiente' => round((float) $pendientes->sum('monto'), 2),
            'cuotas_pendientes' => $pendientes->count(),
            'proxima_cuota' => $pendientes->first(),
        ]);
    }

    private function siguienteCodigoVenta(): string
    {
        $ultimo = CelularVenta::orderByDesc('id')->value('id') ?? 0;
        return 'CEL-' . str_pad((string) ($ultimo + 1), 3, '0', STR_PAD_LEFT);
    }
}