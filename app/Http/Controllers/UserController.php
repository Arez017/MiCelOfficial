<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

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
            User::orderBy('code')->get()->map(fn ($u) => $this->formatUser($u))
        );
    }

    /**
     * POST /api/usuarios
     * Crea un técnico/administrador nuevo. Solo Admin/SuperAdmin.
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
            'branch' => ['nullable', 'string', 'max:100'],
        ]);

        $user = User::create([
            'code' => $this->siguienteCodigo(),
            'name' => $data['name'],
            'username' => $data['username'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
            'rol' => $data['rol'],
            'branch' => $data['branch'] ?? null,
            'active' => true,
        ]);

        return response()->json($this->formatUser($user), 201);
    }

    /**
     * PATCH /api/usuarios/{user}/activo
     * Activa o desactiva un usuario (en vez de borrarlo — así no se pierden
     * sus órdenes/ventas/comisiones históricas). Solo Admin/SuperAdmin.
     */
    public function toggleActivo(Request $request, User $user)
    {
        $this->assertEsAdmin($request);

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
     * Edita rol/sucursal de otro usuario. Solo Admin/SuperAdmin.
     * (Para que cada quien edite SU PROPIO nombre/correo/teléfono, usa /api/perfil.)
     */
    public function update(Request $request, User $user)
    {
        $this->assertEsAdmin($request);

        $data = $request->validate([
            'rol' => ['sometimes', 'in:administrador,tecnico'],
            'branch' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);

        $user->update($data);

        return response()->json($this->formatUser($user));
    }

    // ===== Helpers =====

    private function assertEsAdmin(Request $request): void
    {
        if (! $request->user()->esAdministrador()) {
            abort(403, 'Solo un administrador puede gestionar usuarios.');
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
            'branch' => $u->branch,
            'active' => $u->active,
        ];
    }
}