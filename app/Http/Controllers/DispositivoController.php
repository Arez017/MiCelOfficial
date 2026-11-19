<?php

namespace App\Http\Controllers;

use App\Models\CelularVenta;
use App\Models\Dispositivo;
use App\Models\User;
use App\Services\CodigoBloqueoService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Equipos con bloqueo CuotaLock: vincula el ID del celular con una venta a crédito
 * y genera los códigos de activación, pago y liberación.
 */
class DispositivoController extends Controller
{
    /**
     * Los tokens de cliente (app móvil) también pasan por auth:sanctum,
     * así que se exige explícitamente un usuario de staff administrador.
     */
    private function autorizar(Request $request): User
    {
        $user = $request->user();

        abort_unless(
            $user instanceof User && $user->esAdministrador(),
            403,
            'Solo los administradores pueden gestionar el bloqueo de equipos.'
        );

        return $user;
    }

    /** GET /api/dispositivos */
    public function index(Request $request): JsonResponse
    {
        $this->autorizar($request);

        $orden = ['vencido' => 0, 'por_vencer' => 1, 'al_dia' => 2, 'liquidado' => 3, 'liberado' => 4];

        $lista = Dispositivo::with(['venta.equipo', 'venta.planPago.cuotas', 'ultimoCodigo'])
            ->orderByDesc('id')
            ->get()
            ->map(fn (Dispositivo $d) => $this->presentar($d))
            ->sortBy(fn (array $d) => $orden[$d['estado']] ?? 9)
            ->values();

        return response()->json($lista);
    }

    /** GET /api/dispositivos/{dispositivo} — incluye el historial de códigos */
    public function show(Request $request, Dispositivo $dispositivo): JsonResponse
    {
        $this->autorizar($request);

        $dispositivo->load('codigos.generadoPor');

        return response()->json($this->presentar($dispositivo) + [
            'historial' => $dispositivo->codigos->map(fn ($c) => [
                'id' => $c->id,
                'tipo' => $c->tipo,
                'codigo' => $c->codigo,
                'vence_en' => $c->vence_en?->toDateString(),
                'generado_por' => $c->generadoPor?->name,
                'fecha' => $c->created_at?->toIso8601String(),
            ])->values(),
        ]);
    }

    /**
     * POST /api/dispositivos
     * Vincula el ID que muestra CuotaLock con una venta a crédito y devuelve
     * el primer código (activación), que fija la fecha de vencimiento en el celular.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $this->autorizar($request);

        $request->merge(['device_id' => strtoupper(trim((string) $request->input('device_id')))]);

        $data = $request->validate([
            'celular_venta_id' => ['required', 'integer', 'exists:celulares_ventas,id', 'unique:dispositivos,celular_venta_id'],
            'device_id' => ['required', 'string', 'regex:/^[0-9A-F]{8}$/', 'unique:dispositivos,device_id'],
            'clave' => ['required', 'string', $this->reglaClave()],
        ], [
            'celular_venta_id.unique' => 'Esta venta ya tiene un equipo vinculado.',
            'device_id.regex' => 'El ID del equipo son 8 caracteres (números y letras A-F) que muestra la app CuotaLock.',
            'device_id.unique' => 'Ese ID de equipo ya está vinculado a otra venta.',
            'clave.required' => 'Escribe la clave de vinculación de 16 caracteres que muestra la app CuotaLock.',
        ]);

        $venta = CelularVenta::with('planPago.cuotas')->findOrFail($data['celular_venta_id']);

        if (! $venta->planPago) {
            return response()->json(['message' => 'Solo se puede vincular un equipo a una venta a crédito (con plan de cuotas).'], 422);
        }

        $dispositivo = Dispositivo::create([
            'celular_venta_id' => $venta->id,
            'device_id' => $data['device_id'],
            'clave' => CodigoBloqueoService::normalizarClave($data['clave']),
            'secuencia' => 0,
        ]);

        $emision = CodigoBloqueoService::emitirPago($dispositivo, $user->id);

        return response()->json([
            'dispositivo' => $this->presentar($dispositivo->fresh()),
            'codigo' => $emision['codigo']?->codigo,
            'vence_en' => $emision['vence_en']?->toDateString(),
            'motivo' => $emision['motivo'],
        ], 201);
    }

    /** POST /api/dispositivos/{dispositivo}/codigo — (re)genera el código vigente según las cuotas */
    public function codigo(Request $request, Dispositivo $dispositivo): JsonResponse
    {
        $user = $this->autorizar($request);

        if ($dispositivo->estado === 'liberado') {
            return response()->json(['message' => 'Este equipo ya fue liberado.'], 422);
        }

        try {
            $emision = CodigoBloqueoService::emitirPago($dispositivo, $user->id);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        if ($emision['motivo'] === 'liquidado') {
            return response()->json(['message' => 'Todas las cuotas están pagadas. Usa «Liberar equipo» para entregar el código de liberación.'], 422);
        }
        if ($emision['motivo'] === 'vencido') {
            return response()->json(['message' => 'El cliente tiene cuotas vencidas: el equipo seguirá bloqueado hasta que se ponga al día.'], 422);
        }

        return response()->json([
            'dispositivo' => $this->presentar($dispositivo->fresh()),
            'codigo' => $emision['codigo']->codigo,
            'vence_en' => $emision['vence_en']->toDateString(),
        ]);
    }

    /**
     * PUT /api/dispositivos/{dispositivo}/clave
     * Carga la clave de vinculación de un equipo vinculado antes de la v3 o que se
     * reinstaló (la app genera una clave nueva). Reinicia el contador de emisiones.
     */
    public function clave(Request $request, Dispositivo $dispositivo): JsonResponse
    {
        $this->autorizar($request);

        $data = $request->validate(
            ['clave' => ['required', 'string', $this->reglaClave()]],
            ['clave.required' => 'Escribe la clave de vinculación de 16 caracteres que muestra la app CuotaLock.'],
        );

        $nueva = CodigoBloqueoService::normalizarClave($data['clave']);
        if ($dispositivo->clave !== $nueva) {
            $dispositivo->update(['clave' => $nueva, 'secuencia' => 0]);
        }

        return response()->json(['dispositivo' => $this->presentar($dispositivo->fresh())]);
    }

    /** Valida formato y dígito verificador de la clave de vinculación. */
    private function reglaClave(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) {
            if (! is_string($value) || CodigoBloqueoService::normalizarClave($value) === null) {
                $fail('La clave de vinculación no es válida: revisa que sean los 16 caracteres que muestra la app (letras A-Z y números 2-7).');
            }
        };
    }

    /** POST /api/dispositivos/{dispositivo}/liberar — solo con todas las cuotas pagadas */
    public function liberar(Request $request, Dispositivo $dispositivo): JsonResponse
    {
        $user = $this->autorizar($request);

        $plan = $dispositivo->venta->planPago;
        if ($plan && $plan->cuotas()->where('pagada', false)->exists()) {
            return response()->json(['message' => 'Aún hay cuotas pendientes: no se puede liberar el equipo.'], 422);
        }

        try {
            // Cada liberación es un código nuevo y de un solo uso (antes era siempre el mismo)
            $registro = CodigoBloqueoService::emitirLiberacion($dispositivo, $user->id);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        if ($dispositivo->estado !== 'liberado') {
            $dispositivo->update(['estado' => 'liberado']);
        }

        return response()->json([
            'dispositivo' => $this->presentar($dispositivo->fresh()),
            'codigo' => $registro->codigo,
        ]);
    }

    /**
     * Estado calculado al momento (no se guarda): así siempre coincide con las cuotas.
     *
     * @return array<string, mixed>
     */
    private function presentar(Dispositivo $d): array
    {
        $d->loadMissing(['venta.equipo', 'venta.planPago.cuotas', 'ultimoCodigo']);

        $venta = $d->venta;
        $plan = $venta->planPago;
        $pendientes = $plan ? $plan->cuotas->where('pagada', false)->sortBy('numero')->values() : collect();
        $proxima = $pendientes->first();

        $limite = $proxima
            ? Carbon::parse($proxima->fecha_vencimiento)->addDays((int) config('cuotalock.dias_gracia'))
            : null;
        $diasRestantes = $limite
            ? CodigoBloqueoService::diasDesdeEpoch($limite) - CodigoBloqueoService::diasDesdeEpoch(now())
            : null;

        $estado = match (true) {
            $d->estado === 'liberado' => 'liberado',
            $plan !== null && $pendientes->isEmpty() => 'liquidado',
            $diasRestantes !== null && $diasRestantes < 0 => 'vencido',
            $diasRestantes !== null && $diasRestantes <= 3 => 'por_vencer',
            default => 'al_dia',
        };

        return [
            'id' => $d->id,
            'celular_venta_id' => $d->celular_venta_id,
            'device_id' => $d->device_id,
            'tiene_clave' => filled($d->clave),
            'emisiones' => (int) $d->secuencia,
            'estado' => $estado,
            'vence_en' => $d->vence_en?->toDateString(),
            'dias_restantes' => $diasRestantes,
            'cliente' => $venta->cliente,
            'telefono' => $venta->telefono,
            'modelo' => $venta->equipo?->modelo,
            'imei' => $venta->equipo?->imei,
            'venta_codigo' => $venta->codigo,
            'sucursal_id' => $venta->sucursal_id,
            'cuotas_pendientes' => $pendientes->count(),
            'saldo_pendiente' => round((float) $pendientes->sum('monto'), 2),
            'proxima_cuota' => $proxima ? [
                'id' => $proxima->id,
                'numero' => $proxima->numero,
                'fecha_vencimiento' => Carbon::parse($proxima->fecha_vencimiento)->toDateString(),
                'monto' => (float) $proxima->monto,
            ] : null,
            'ultimo_codigo' => $d->ultimoCodigo ? [
                'tipo' => $d->ultimoCodigo->tipo,
                'codigo' => $d->ultimoCodigo->codigo,
                'vence_en' => $d->ultimoCodigo->vence_en?->toDateString(),
                'fecha' => $d->ultimoCodigo->created_at?->toIso8601String(),
            ] : null,
        ];
    }
}
