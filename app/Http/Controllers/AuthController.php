<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * POST /api/login
     * Equivalente a doLogin() en app.js — pero usando username/password
     * contra la BD real en vez del array `usuarios`.
     */
    public function login(Request $request)
    {
        $data = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('username', $data['username'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'username' => ['Usuario o contraseña incorrectos.'],
            ]);
        }

        if (! $user->active) {
            throw ValidationException::withMessages([
                'username' => ['Este usuario está inactivo. Contacta a un administrador.'],
            ]);
        }

        // Revoca tokens anteriores (opcional, evita acumular tokens viejos)
        $user->tokens()->delete();

        $token = $user->createToken('micel-token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $this->formatUser($user),
        ]);
    }

    /**
     * POST /api/logout
     * Equivalente a doLogout() en app.js.
     */
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Sesión cerrada correctamente.']);
    }

    /**
     * GET /api/me
     * Para que el frontend (web o Flutter) recupere la sesión al recargar,
     * en vez de depender de la variable `currentUser` en memoria del navegador.
     */
    public function me(Request $request)
    {
        return response()->json($this->formatUser($request->user()));
    }

    /**
     * Da el mismo shape que usa tu JS (name, rol, code, branch...)
     * para que en el frontend no tengas que renombrar nada.
     */
    private function formatUser(User $user): array
    {
        return [
            'id' => $user->id,
            'code' => $user->code,
            'username' => $user->username,
            'name' => $user->name,
            'rol' => $user->rol, // superadmin | administrador | tecnico
            'branch' => $user->branch,
            'active' => $user->active,
            'telefono' => $user->telefono,
            'foto_path' => $user->foto_path,
        ];
    }
}