<?php

namespace App\Http\Controllers;

use App\Models\Cliente;
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

        $phoneNorm = preg_replace('/\D+/', '', $data['phone']);

        $existente = Cliente::with('sucursal')->get()
            ->first(fn (Cliente $c) => preg_replace('/\D+/', '', (string) $c->phone) === $phoneNorm);

        if ($existente) {
            return response()->json([
                'message' => 'Este cliente ya está registrado: '.$existente->name.' ('.$existente->code.'). No se creó un duplicado.',
                'cliente' => $this->format($existente),
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
            $phoneNorm = preg_replace('/\D+/', '', $data['phone']);
            $otro = Cliente::where('id', '!=', $cliente->id)->get()
                ->first(fn (Cliente $c) => preg_replace('/\D+/', '', (string) $c->phone) === $phoneNorm);
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
