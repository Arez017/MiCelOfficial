<?php

namespace App\Http\Controllers;

use App\Models\Cliente;
use App\Models\Cupon;
use App\Models\ServiceOrder;
use App\Services\ClienteFidelidadService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ClienteAuthController extends Controller
{
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

        if (isset($cliente->active) && ! $cliente->active) {
            throw ValidationException::withMessages([
                'username' => ['Tu cuenta está inactiva. Contacta al taller.'],
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
     * PUT /api/cliente/perfil
     * Actualiza nombre, teléfono y/o username del cliente logueado.
     */
    public function updatePerfil(Request $request)
    {
        $this->assertEsCliente($request);
        /** @var Cliente $cliente */
        $cliente = $request->user();

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'username' => [
                'sometimes',
                'string',
                'min:3',
                'max:50',
                'alpha_dash',
                Rule::unique('clientes', 'username')->ignore($cliente->id),
            ],
        ]);

        if (isset($data['name'])) {
            $cliente->name = $data['name'];
        }
        if (array_key_exists('phone', $data)) {
            $cliente->phone = $data['phone'] ?: null;
        }
        if (isset($data['username'])) {
            $cliente->username = $data['username'];
        }

        $cliente->save();

        return response()->json([
            'message' => 'Perfil actualizado.',
            'cliente' => $this->formatCliente($cliente->fresh()),
        ]);
    }

    /**
     * PUT /api/cliente/password
     * Cambia la contraseña (pide la actual).
     */
    public function changePassword(Request $request)
    {
        $this->assertEsCliente($request);
        /** @var Cliente $cliente */
        $cliente = $request->user();

        $data = $request->validate([
            'password_actual' => ['required', 'string'],
            'password' => ['required', 'string', 'min:4', 'confirmed'],
        ]);

        if (! Hash::check($data['password_actual'], $cliente->password)) {
            throw ValidationException::withMessages([
                'password_actual' => ['La contraseña actual no es correcta.'],
            ]);
        }

        $cliente->password = $data['password']; // cast hashed
        $cliente->save();

        return response()->json(['message' => 'Contraseña actualizada.']);
    }

    public function misOrdenes(Request $request)
    {
        $this->assertEsCliente($request);
        $cliente = $request->user();

        $ordenes = ServiceOrder::with('tecnico')
            ->where(function ($q) use ($cliente) {
                $q->where('cliente_id', $cliente->id);
                if (! empty($cliente->phone)) {
                    $q->orWhere('phone', $cliente->phone);
                }
            })
            ->orderByDesc('created_at')
            ->get();

        return response()->json($ordenes->map(fn ($o) => [
            'id' => $o->id,
            'code' => $o->code,
            'device' => $o->device,
            'service' => $o->service,
            'status' => $o->status,
            'monto' => (float) $o->monto,
            'tech' => $o->tecnico?->name,
            'created_at' => optional($o->created_at)?->toDateString(),
        ]));
    }

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


    /**
     * POST /api/cliente/recuperar-password  (público)
     * Restablece clave validando usuario + teléfono del cliente.
     */
    public function recuperarPassword(Request $request)
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'max:50'],
            'phone' => ['required', 'string', 'max:30'],
            'password' => ['required', 'string', 'min:4', 'confirmed'],
        ]);

        $cliente = Cliente::where('username', $data['username'])->first();
        if (! $cliente || ! $cliente->tieneCuenta()) {
            return response()->json([
                'message' => 'No encontramos una cuenta con ese usuario.',
            ], 404);
        }

        if ($cliente->active === false) {
            return response()->json([
                'message' => 'Tu cuenta está inactiva. Contacta al taller.',
            ], 403);
        }

        $phoneReq = preg_replace('/\D+/', '', $data['phone']);
        $phoneCli = preg_replace('/\D+/', '', (string) $cliente->phone);
        $match = false;
        if ($phoneReq !== '' && $phoneCli !== '') {
            if ($phoneReq === $phoneCli) {
                $match = true;
            } else {
                $a = $phoneReq;
                $b = $phoneCli;
                if (strlen($a) < strlen($b)) {
                    [$a, $b] = [$b, $a];
                }
                $match = strlen($b) >= 7 && str_ends_with($a, $b);
            }
        }

        if (! $match) {
            return response()->json([
                'message' => 'El teléfono no coincide con el registrado en el taller.',
            ], 422);
        }

        $cliente->password = $data['password']; // cast hashed en el modelo
        $cliente->save();
        $cliente->tokens()->delete(); // cerrar sesiones previas

        return response()->json([
            'message' => 'Contraseña actualizada. Ya puedes iniciar sesión.',
        ]);
    }

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
