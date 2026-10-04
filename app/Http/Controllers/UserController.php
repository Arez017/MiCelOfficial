<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    /**
     * GET /api/usuarios
     * Reemplaza el array fijo `tecnicos` de data.js — cualquier usuario logueado
     * puede consultarlo (lo necesitas para los <select> de técnico y para
     * mostrar nombres en órdenes/ventas/recibos).
     */
    public function index()
    {
        return response()->json(
            User::with('sucursal')->orderBy('code')->get()->map(fn ($u) => $this->formatUser($u))
        );
    }

    /**
     * POST /api/usuarios
     * Crea un técnico/administrador nuevo. Admin y SuperAdmin pueden crear.
     */
    public function store(Request $request)
    {
        $this->assertEsAdmin($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'max:50', 'unique:users,username'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:4'],
            'rol' => ['required', 'in:administrador,tecnico'], // superadmin no se crea desde aquí
            'sucursal_id' => ['nullable', 'exists:sucursales,id'],
        ]);

        $user = User::create([
            'code' => $this->siguienteCodigo(),
            'name' => $data['name'],
            'username' => $data['username'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
            'rol' => $data['rol'],
            'sucursal_id' => $data['sucursal_id'] ?? null,
            'active' => true,
        ]);

        return response()->json($this->formatUser($user), 201);
    }

    /**
     * PATCH /api/usuarios/{user}/activo
     * Activa o desactiva un usuario (en vez de borrarlo — así no se pierden
     * sus órdenes/ventas/comisiones históricas).
     *
     * Igual que editar: SOLO SuperAdmin. Un Administrador puede CREAR gente
     * nueva, pero no desactivar cuentas ya existentes (ni siquiera técnicos).
     */
    public function toggleActivo(Request $request, User $user)
    {
        $this->assertEsSuperAdmin($request);

        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'No puedes desactivar tu propia cuenta.'], 422);
        }

        $user->active = ! $user->active;
        $user->save();

        // Si lo desactivan, se le revocan sus tokens para cerrarle la sesión de inmediato
        if (! $user->active) {
            $user->tokens()->delete();
        }

        return response()->json($this->formatUser($user));
    }

    /**
     * PUT /api/usuarios/{user}
     * Edita los datos de otro usuario: nombre, username, correo, rol,
     * sucursal y (opcionalmente) resetea su contraseña.
     *
     * SOLO SuperAdmin — ni siquiera un Administrador puede tocar esto.
     * Esto es justamente lo que permite recuperar a alguien que olvidó su
     * contraseña (cosa que antes nadie podía hacer, porque /perfil/password
     * exige la contraseña ACTUAL).
     *
     * El campo "password" es opcional: si no lo mandas, no se toca.
     */
    public function update(Request $request, User $user)
    {
        $this->assertEsSuperAdmin($request);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'username' => ['sometimes', 'string', 'max:50', Rule::unique('users', 'username')->ignore($user->id)],
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['sometimes', 'nullable', 'string', 'min:4'],
            'rol' => ['sometimes', 'in:administrador,tecnico'],
            'sucursal_id' => ['sometimes', 'nullable', 'exists:sucursales,id'],
        ]);

        if (! empty($data['password'])) {
            $data['password'] = Hash::make($data['password']);
            // Si le resetean la contraseña, se le cierra la sesión actual por seguridad.
            $user->tokens()->delete();
        } else {
            unset($data['password']);
        }

        $user->update($data);

        return response()->json($this->formatUser($user));
    }

    // ===== Helpers =====

    /** Admin o SuperAdmin: puede ver y CREAR usuarios. */
    private function assertEsAdmin(Request $request): void
    {
        if (! $request->user()->esAdministrador()) {
            abort(403, 'Solo un administrador puede gestionar usuarios.');
        }
    }

    /** Solo SuperAdmin: puede EDITAR datos/contraseña y activar/desactivar. */
    private function assertEsSuperAdmin(Request $request): void
    {
        if (! $request->user()->esSuperAdmin()) {
            abort(403, 'Solo el SuperAdmin puede editar o desactivar usuarios.');
        }
    }

    private function siguienteCodigo(): string
    {
        $ultimo = User::orderByDesc('id')->value('id') ?? 0;
        return 'TEC-' . str_pad((string) ($ultimo + 1), 2, '0', STR_PAD_LEFT);
    }

    private function formatUser(User $u): array
    {
        return [
            'id' => $u->id,
            'code' => $u->code,
            'username' => $u->username,
            'name' => $u->name,
            'email' => $u->email,
            'rol' => $u->rol,
            'sucursal_id' => $u->sucursal_id,
            'sucursal' => $u->sucursal?->nombre,
            'active' => $u->active,
        ];
    }
}