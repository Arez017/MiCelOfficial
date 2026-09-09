<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProfileController extends Controller
{
    /**
     * GET /api/perfil
     * Igual que /api/me, pero pensado específicamente para la pantalla de Perfil.
     */
    public function show(Request $request)
    {
        return response()->json($this->formatUser($request->user()));
    }

    /**
     * PUT /api/perfil
     * El usuario edita SU PROPIO nombre, correo y teléfono.
     * (username, code y rol NO se pueden autoeditar — eso lo cambia un admin
     * desde el módulo de Usuarios, no el propio dueño de la cuenta.)
     */
    public function update(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => [
                'required', 'email', 'max:255',
                Rule::unique('users', 'email')->ignore($user->id),
            ],
            'telefono' => ['nullable', 'string', 'max:30'],
        ]);

        $user->update($data);

        return response()->json($this->formatUser($user));
    }

    /**
     * PUT /api/perfil/password
     * Requiere la contraseña actual para poder cambiarla (evita que alguien
     * con la sesión abierta se la cambie sin saber la actual).
     */
    public function updatePassword(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'password_actual' => ['required', 'string'],
            'password_nueva' => ['required', 'string', 'min:6', 'confirmed'],
            // el campo de confirmación debe llamarse: password_nueva_confirmation
        ]);

        if (! Hash::check($data['password_actual'], $user->password)) {
            throw ValidationException::withMessages([
                'password_actual' => ['La contraseña actual no es correcta.'],
            ]);
        }

        $user->update(['password' => Hash::make($data['password_nueva'])]);

        // Por seguridad, cierra las demás sesiones/tokens activos al cambiar la contraseña
        $user->tokens()->delete();
        $nuevoToken = $user->createToken('micel-token')->plainTextToken;

        return response()->json([
            'message' => 'Contraseña actualizada correctamente.',
            'token' => $nuevoToken, // el frontend debe reemplazar el token guardado con este
        ]);
    }

    /**
     * POST /api/perfil/foto
     * Sube/reemplaza la foto de perfil (multipart/form-data, campo "foto").
     */
    public function subirFoto(Request $request)
    {
        $request->validate([
            'foto' => ['required', 'image', 'max:2048'], // 2MB máx
        ]);

        $user = $request->user();

        // Borra la foto anterior si existía, para no acumular archivos huérfanos
        if ($user->foto_path && Storage::disk('public')->exists($user->foto_path)) {
            Storage::disk('public')->delete($user->foto_path);
        }

        $path = $request->file('foto')->store('perfiles', 'public');
        $user->update(['foto_path' => $path]);

        return response()->json($this->formatUser($user));
    }

    private function formatUser($user): array
    {
        return [
            'id' => $user->id,
            'code' => $user->code,
            'username' => $user->username,
            'name' => $user->name,
            'email' => $user->email,
            'rol' => $user->rol,
            'branch' => $user->branch,
            'active' => $user->active,
            'telefono' => $user->telefono,
            'foto_path' => $user->foto_path,
            'foto_url' => $user->foto_path ? asset('storage/' . $user->foto_path) : null,
        ];
    }
}