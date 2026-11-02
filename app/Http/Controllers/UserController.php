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
     */
    public function index()
    {
        return response()->json(
            User::with('sucursal')->orderBy('code')->get()->map(fn ($u) => $this->formatUser($u))
        );
    }

    /**
     * POST /api/usuarios
     * Crea técnico o administrador. Admin y SuperAdmin pueden crear.
     */
    public function store(Request $request)
    {
        $this->assertEsAdmin($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'max:50', 'unique:users,username'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:4'],
            'rol' => ['required', 'in:administrador,tecnico'],
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

        return response()->json($this->formatUser($user->load('sucursal')), 201);
    }

    /**
     * PATCH /api/usuarios/{user}/activo
     * Solo SuperAdmin.
     */
    public function toggleActivo(Request $request, User $user)
    {
        // Admin y SuperAdmin pueden activar/inactivar
        $this->assertEsAdmin($request);

        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'No puedes desactivar tu propia cuenta.'], 422);
        }

        $actor = $request->user();

        // Un Admin normal NO puede tocar SuperAdmin ni a otros administradores
        if (! $actor->esSuperAdmin()) {
            if (in_array($user->rol, ['superadmin', 'administrador'], true)) {
                return response()->json([
                    'message' => 'Un administrador solo puede activar/inactivar técnicos.',
                ], 403);
            }
        }

        $user->active = ! $user->active;
        $user->save();

        return response()->json($this->formatUser($user->load('sucursal')));
    }

    /**
     * PUT /api/usuarios/{user}
     * Solo SuperAdmin. Password opcional.
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
            $user->tokens()->delete();
        } else {
            unset($data['password']);
        }

        $user->update($data);

        return response()->json($this->formatUser($user->load('sucursal')));
    }

    // ===== Helpers =====

    private function assertEsAdmin(Request $request): void
    {
        if (! $request->user()->esAdministrador()) {
            abort(403, 'Solo un administrador puede gestionar usuarios.');
        }
    }

    private function assertEsSuperAdmin(Request $request): void
    {
        if (! $request->user()->esSuperAdmin()) {
            abort(403, 'Solo el SuperAdmin puede editar o desactivar usuarios.');
        }
    }

    /**
     * Genera TEC-01, TEC-02, … usando el MÁXIMO código existente
     * (no el id de la tabla), y evita duplicados.
     */
    private function siguienteCodigo(): string
    {
        $max = 0;

        foreach (User::query()->pluck('code') as $code) {
            if (preg_match('/^TEC-(\d+)$/i', (string) $code, $m)) {
                $n = (int) $m[1];
                if ($n > $max) {
                    $max = $n;
                }
            }
        }

        $candidato = $max + 1;

        do {
            $code = 'TEC-'.str_pad((string) $candidato, 2, '0', STR_PAD_LEFT);
            $existe = User::where('code', $code)->exists();
            $candidato++;
        } while ($existe);

        return $code;
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
            'telefono' => $u->telefono,
            'foto_path' => $u->foto_path,
            'foto_url' => $u->foto_path ? asset('storage/'.$u->foto_path) : null,
        ];
    }
}
