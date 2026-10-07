<?php

namespace App\Http\Controllers;

use App\Models\Cliente;
use App\Models\Cupon;
use App\Models\ServiceOrder;
use App\Services\ClienteFidelidadService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class ClienteAuthController extends Controller
{
    /**
     * POST /api/cliente/login
     * Público. Login de la app móvil (SOLO clientes, no staff).
     */
    public function login(Request $request)
    {
        $data = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $cliente = Cliente::where('username', $data['username'])->first();

        if (! $cliente || ! $cliente->tieneCuenta() || ! Hash::check($data['password'], $cliente->password)) {
            throw ValidationException::withMessages([
                'username' => ['Usuario o contraseña incorrectos.'],
            ]);
        }

        $token = $cliente->createToken('micel-cliente-token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'cliente' => $this->formatCliente($cliente),
        ]);
    }

    public function logout(Request $request)
    {
        $this->assertEsCliente($request);
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Sesión cerrada.']);
    }

    public function me(Request $request)
    {
        $this->assertEsCliente($request);

        return response()->json($this->formatCliente($request->user()));
    }

    /**
     * GET /api/cliente/mis-ordenes
     * OJO: vincula por teléfono (service_orders no tiene cliente_id todavía
     * — eso es el Paso 3b pendiente).
     */
    public function misOrdenes(Request $request)
    {
        $this->assertEsCliente($request);
        $cliente = $request->user();

        if (empty($cliente->phone)) {
            return response()->json([]);
        }

        $ordenes = ServiceOrder::with('tecnico')
            ->where('phone', $cliente->phone)
            ->orderByDesc('created_at')
            ->get();

        return response()->json($ordenes->map(fn ($o) => [
            'id' => $o->id,
            'code' => $o->code,
            'device' => $o->device,
            'service' => $o->service,
            'status' => $o->status,
            'monto' => $o->monto,
            'tecnico' => $o->tecnico?->name,
            'created_at' => $o->created_at,
        ]));
    }

    /**
     * GET /api/cliente/cupones
     * Cupones activos y no vencidos. Los "solo_vip" solo aparecen si el
     * cliente logueado ya es VIP.
     */
    public function cupones(Request $request)
    {
        $this->assertEsCliente($request);
        $cliente = $request->user();

        $cupones = Cupon::where('activo', true)
            ->where(function ($q) {
                $q->whereNull('fecha_vencimiento')->orWhereDate('fecha_vencimiento', '>=', now());
            })
            ->when(! $cliente->es_vip, fn ($q) => $q->where('solo_vip', false))
            ->orderBy('fecha_vencimiento')
            ->get();

        return response()->json($cupones);
    }

    // ===== Helpers =====

    private function assertEsCliente(Request $request): void
    {
        if (! $request->user() instanceof Cliente) {
            abort(403, 'Esta ruta es solo para clientes.');
        }
    }

    private function formatCliente(Cliente $c): array
    {
        return [
            'id' => $c->id,
            'code' => $c->code,
            'name' => $c->name,
            'phone' => $c->phone,
            'username' => $c->username,
            'sucursal_id' => $c->sucursal_id,
            'sucursal' => $c->sucursal?->nombre,
            'visits' => $c->visits,
            'coins' => $c->coins,
            'coins_valor_bs' => round($c->coins * ClienteFidelidadService::BS_POR_COIN_CANJE, 2),
            'total_gastado' => (float) $c->total_gastado,
            'es_vip' => $c->es_vip,
        ];
    }
}
