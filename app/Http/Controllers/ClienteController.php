<?php

namespace App\Http\Controllers;

use App\Models\Cliente;
use App\Support\ClientePhone;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ClienteController extends Controller
{
    public function index(Request $request)
    {
        $query = Cliente::with('sucursal');

        if ($request->filled('q')) {
            $q = $request->string('q');
            $query->where(function ($sub) use ($q) {
                $sub->where('name', 'ilike', "%{$q}%")
                    ->orWhere('phone', 'ilike', "%{$q}%")
                    ->orWhere('code', 'ilike', "%{$q}%")
                    ->orWhere('username', 'ilike', "%{$q}%");
            });
        }

        return response()->json(
            $query->orderByDesc('last_visit')->get()->map(fn ($c) => $this->format($c))
        );
    }

    public function show(Cliente $cliente)
    {
        return response()->json($this->format($cliente->load(['recibos', 'sucursal'])));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['required', 'string', 'max:30'],
            'sucursal_id' => ['nullable', 'exists:sucursales,id'],
        ]);

        $existente = ClientePhone::findByPhone($data['phone']);
        if ($existente) {
            $existente->load('sucursal');
            // Si viene otra sucursal, no crea duplicado: actualiza sucursal opcionalmente
            if (! empty($data['sucursal_id']) && ! $existente->sucursal_id) {
                $existente->update(['sucursal_id' => $data['sucursal_id']]);
            }

            return response()->json([
                'message' => 'Este cliente ya está registrado: '.$existente->name.' ('.$existente->code.'). No se creó un duplicado (mismo teléfono).',
                'cliente' => $this->format($existente->fresh('sucursal')),
            ], 422);
        }

        $data['code'] = $this->siguienteCodigo();
        $data['visits'] = 1;
        $data['last_visit'] = now();
        $data['active'] = true;

        $cliente = Cliente::create($data);

        return response()->json($this->format($cliente->load('sucursal')), 201);
    }

    /** Admin o Super Admin */
    public function update(Request $request, Cliente $cliente)
    {
        $this->assertEsAdmin($request);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'phone' => ['sometimes', 'string', 'max:30'],
            'sucursal_id' => ['nullable', 'exists:sucursales,id'],
            'active' => ['sometimes', 'boolean'],
        ]);

        if (! empty($data['phone'])) {
            $otro = ClientePhone::findByPhone($data['phone'], $cliente->id);
            if ($otro) {
                return response()->json([
                    'message' => 'Ese teléfono ya pertenece a '.$otro->name.' ('.$otro->code.').',
                ], 422);
            }
        }

        $cliente->update($data);

        return response()->json($this->format($cliente->load('sucursal')));
    }

    /**
     * PATCH /api/clientes/{cliente}/cuenta
     * Crea o resetea usuario/clave app. Password por defecto: 1234
     * Admin o Super Admin.
     */
    public function gestionarCuenta(Request $request, Cliente $cliente)
    {
        $this->assertEsAdmin($request);

        $data = $request->validate([
            'username' => ['nullable', 'string', 'max:50'],
            'password' => ['nullable', 'string', 'min:4'],
        ]);

        $username = $data['username'] ?? $cliente->username;
        if (empty($username)) {
            $username = $this->generarUsername($cliente);
        }

        // único
        $base = $username;
        $i = 1;
        while (
            Cliente::where('username', $username)
                ->where('id', '!=', $cliente->id)
                ->exists()
        ) {
            $username = $base.$i;
            $i++;
        }

        $password = $data['password'] ?? '1234';

        $cliente->update([
            'username' => $username,
            'password' => $password, // cast hashed en el modelo
            'active' => $cliente->active ?? true,
        ]);

        return response()->json([
            'message' => 'Cuenta de app lista.',
            'username' => $username,
            'password_temporal' => $password, // se muestra una vez al staff
            'cliente' => $this->format($cliente->fresh('sucursal')),
        ]);
    }

    /**
     * PATCH /api/clientes/{cliente}/activar
     * Activa o inactiva (bloquea login en Flutter).
     */
    public function toggleActivo(Request $request, Cliente $cliente)
    {
        $this->assertEsAdmin($request);

        $data = $request->validate([
            'active' => ['required', 'boolean'],
        ]);

        $cliente->update(['active' => $data['active']]);

        // Si se inactiva, cerrar tokens de la app
        if (! $data['active']) {
            $cliente->tokens()->delete();
        }

        return response()->json([
            'message' => $data['active'] ? 'Cliente activado.' : 'Cliente inactivado (no puede usar la app).',
            'cliente' => $this->format($cliente->fresh('sucursal')),
        ]);
    }

    public function registrarVisita(Cliente $cliente)
    {
        $cliente->increment('visits');
        $cliente->update(['last_visit' => now()]);

        return response()->json($this->format($cliente));
    }

    
    /**
     * POST /api/clientes/unificar-duplicados
     * Junta fichas con el mismo teléfono (con o sin código de país).
     * Conserva la que tiene cuenta app / más visitas / id menor.
     */
    public function unificarDuplicados(Request $request)
    {
        $this->assertEsAdmin($request);

        if (! class_exists(\App\Support\ClientePhone::class)) {
            return response()->json([
                'message' => 'Falta app/Support/ClientePhone.php — cópialo y corre: composer dump-autoload',
            ], 500);
        }

        $clientes = Cliente::orderBy('id')->get();
        $usados = [];
        $fusionados = 0;
        $detalle = [];
        $errores = [];
        $pares = [];

        // Debug: mostrar qué teléfonos se consideran iguales
        foreach ($clientes as $a) {
            foreach ($clientes as $b) {
                if ($a->id >= $b->id) {
                    continue;
                }
                if (\App\Support\ClientePhone::same($a->phone, $b->phone)) {
                    $pares[] = $a->code.'('.$a->phone.') ≈ '.$b->code.'('.$b->phone.')';
                }
            }
        }

        foreach ($clientes as $c) {
            if (in_array($c->id, $usados, true)) {
                continue;
            }

            $grupo = $clientes->filter(function (Cliente $o) use ($c, $usados) {
                if (in_array($o->id, $usados, true)) {
                    return false;
                }
                if ($o->id === $c->id) {
                    return true;
                }

                return \App\Support\ClientePhone::same($c->phone, $o->phone);
            })->values();

            if ($grupo->count() < 2) {
                continue;
            }

            $principal = $grupo->sortBy([
                fn (Cliente $x) => empty($x->username) ? 1 : 0,
                fn (Cliente $x) => -((int) $x->visits + (int) $x->coins),
                fn (Cliente $x) => $x->id,
            ])->first();

            foreach ($grupo as $dup) {
                if ($dup->id === $principal->id) {
                    continue;
                }

                try {
                    // Sumar métricas
                    $principal->visits = (int) $principal->visits + (int) $dup->visits;
                    $principal->coins = (int) $principal->coins + (int) $dup->coins;
                    $principal->total_gastado = (float) $principal->total_gastado + (float) ($dup->total_gastado ?? 0);
                    if (! empty($dup->es_vip)) {
                        $principal->es_vip = true;
                    }
                    if (empty($principal->username) && ! empty($dup->username)) {
                        $principal->username = $dup->username;
                        $principal->password = $dup->getAttributes()['password'] ?? $dup->password;
                    }
                    $pN = \App\Support\ClientePhone::norm($principal->phone);
                    $dN = \App\Support\ClientePhone::norm($dup->phone);
                    if (strlen($dN) >= 7 && strlen($dN) < strlen($pN)) {
                        $principal->phone = $dN;
                    }
                    $principal->save();

                    // Reasignar órdenes
                    try {
                        \DB::table('service_orders')->where('cliente_id', $dup->id)->update(['cliente_id' => $principal->id]);
                    } catch (\Throwable $e) {
                        try {
                            \App\Models\ServiceOrder::where('cliente_id', $dup->id)->update(['cliente_id' => $principal->id]);
                        } catch (\Throwable $e2) {
                            $errores[] = 'órdenes '.$dup->code.': '.$e2->getMessage();
                        }
                    }

                    try {
                        $dup->tokens()->delete();
                    } catch (\Throwable $e) {
                    }

                    // Borrar duplicado (forzado)
                    \DB::table('clientes')->where('id', $dup->id)->delete();
                    // por si usaba soft delete en el modelo
                    try {
                        $dup->delete();
                    } catch (\Throwable $e) {
                    }

                    $usados[] = $dup->id;
                    $detalle[] = ($dup->code ?? $dup->id).' → '.($principal->code ?? $principal->id);
                    $fusionados++;
                } catch (\Throwable $e) {
                    $errores[] = ($dup->code ?? (string) $dup->id).': '.$e->getMessage();
                }
            }
            $usados[] = $principal->id;
        }

        return response()->json([
            'message' => $fusionados
                ? "Se unificaron {$fusionados} ficha(s) duplicada(s)."
                : (count($pares)
                    ? 'Había pares iguales pero no se pudo borrar. Errores: '.implode(' | ', $errores)
                    : 'No se detectaron teléfonos equivalentes. Revisa ClientePhone.'),
            'detalle' => $detalle,
            'pares_detectados' => $pares,
            'errores' => $errores,
        ]);
    }



    public function destroy(Request $request, Cliente $cliente)
    {
        $this->assertEsSuperAdmin($request);
        $cliente->tokens()->delete();
        $cliente->delete();

        return response()->json(['message' => 'Cliente eliminado.']);
    }

    private function format(Cliente $c): array
    {
        return [
            'id' => $c->id,
            'code' => $c->code,
            'name' => $c->name,
            'phone' => $c->phone,
            'sucursal_id' => $c->sucursal_id,
            'sucursal' => $c->sucursal?->nombre,
            'visits' => $c->visits,
            'last_visit' => $c->last_visit,
            'username' => $c->username,
            'tiene_cuenta' => $c->tieneCuenta(),
            'active' => $c->active !== false,
            'coins' => $c->coins,
            'es_vip' => (bool) $c->es_vip,
            'total_gastado' => $c->total_gastado,
        ];
    }

    private function generarUsername(Cliente $c): string
    {
        $phone = preg_replace('/\D+/', '', (string) $c->phone);
        $base = Str::lower(Str::slug(Str::before($c->name, ' ') ?: 'cliente', ''));
        if ($base === '') {
            $base = 'cliente';
        }
        if (strlen($phone) >= 4) {
            $base .= substr($phone, -4);
        }

        return substr($base, 0, 40);
    }

    private function assertEsAdmin(Request $request): void
    {
        if (! $request->user()->esAdministrador()) {
            abort(403, 'Solo un administrador puede modificar clientes.');
        }
    }

    private function assertEsSuperAdmin(Request $request): void
    {
        $user = $request->user();
        if (! method_exists($user, 'esSuperAdmin') || ! $user->esSuperAdmin()) {
            abort(403, 'Solo el Super Admin puede eliminar clientes.');
        }
    }

    private function siguienteCodigo(): string
    {
        $ultimo = Cliente::orderByDesc('id')->value('id') ?? 0;

        return 'CLI-'.str_pad((string) ($ultimo + 1), 3, '0', STR_PAD_LEFT);
    }
}
