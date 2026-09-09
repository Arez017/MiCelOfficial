<?php

namespace App\Http\Controllers;

use App\Models\HistorialReparacion;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class HistorialReparacionController extends Controller
{
    /**
     * GET /api/historial
     * Reemplaza renderHistorial(historialData). Un Técnico solo ve el suyo.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = HistorialReparacion::with('tecnico');

        if ($user->esTecnico()) {
            $query->where('tecnico_id', $user->id);
        }

        return response()->json($query->orderByDesc('id')->get());
    }

    public function show(Request $request, HistorialReparacion $historial)
    {
        $this->assertPuedeVer($request, $historial);

        return response()->json($historial->load('tecnico'));
    }

    /**
     * POST /api/historial
     * Reemplaza guardarHistorial() — sube foto (multipart) + genera el qr_data.
     * La FOTO se sube como archivo (form-data, campo "foto"), no como base64.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'equipo' => ['required', 'string', 'max:255'],
            'descripcion' => ['nullable', 'string'],
            'foto' => ['nullable', 'image', 'max:4096'], // 4MB máx
        ]);

        $user = $request->user();

        $fotoPath = null;
        if ($request->hasFile('foto')) {
            $fotoPath = $request->file('foto')->store('historial', 'public');
        }

        $historial = HistorialReparacion::create([
            'equipo' => $data['equipo'],
            'descripcion' => $data['descripcion'] ?? null,
            'foto_path' => $fotoPath,
            'tecnico_id' => $user->id,
            'qr_data' => Str::uuid()->toString(), // identificador único para el QR
        ]);

        return response()->json($historial->load('tecnico'), 201);
    }

    // ===== Helpers =====

    private function assertPuedeVer(Request $request, HistorialReparacion $historial): void
    {
        $user = $request->user();
        if ($user->esTecnico() && $historial->tecnico_id !== $user->id) {
            abort(403, 'No puedes ver historial de otro técnico.');
        }
    }
}