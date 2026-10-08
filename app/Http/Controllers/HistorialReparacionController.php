<?php

namespace App\Http\Controllers;

use App\Models\HistorialReparacion;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class HistorialReparacionController extends Controller
{
    /**
     * GET /api/historial
     * Técnico solo ve el suyo; Admin/SuperAdmin ven todo (biblioteca).
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = HistorialReparacion::with('tecnico');

        if ($user->esTecnico()) {
            $query->where('tecnico_id', $user->id);
        }

        return response()->json(
            $query->orderByDesc('id')->get()->map(fn ($h) => $this->format($h))
        );
    }

    public function show(Request $request, HistorialReparacion $historial)
    {
        $this->assertPuedeVer($request, $historial);

        return response()->json($this->format($historial->load('tecnico')));
    }

    /**
     * POST /api/historial
     * Acepta varias fotos: form-data
     *   - equipo (required)
     *   - descripcion (optional)
     *   - foto  (optional, 1 imagen — compatibilidad)
     *   - fotos[] (optional, varias imágenes)
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'equipo' => ['required', 'string', 'max:255'],
            'descripcion' => ['nullable', 'string'],
            'foto' => ['nullable', 'image', 'max:4096'],
            'fotos' => ['nullable', 'array', 'max:12'],
            'fotos.*' => ['image', 'max:4096'],
        ]);

        $user = $request->user();
        $paths = [];

        // Varias fotos (preferido)
        if ($request->hasFile('fotos')) {
            foreach ($request->file('fotos') as $file) {
                if ($file && $file->isValid()) {
                    $paths[] = $file->store('historial', 'public');
                }
            }
        }

        // Una sola foto (compatibilidad con el form viejo)
        if ($request->hasFile('foto')) {
            $paths[] = $request->file('foto')->store('historial', 'public');
        }

        $paths = array_values(array_unique($paths));
        $portada = $paths[0] ?? null;

        $historial = HistorialReparacion::create([
            'equipo' => $data['equipo'],
            'descripcion' => $data['descripcion'] ?? null,
            'foto_path' => $portada,
            'fotos' => $paths ?: null,
            'tecnico_id' => $user->id,
            'qr_data' => Str::uuid()->toString(),
        ]);

        return response()->json($this->format($historial->load('tecnico')), 201);
    }

    private function format(HistorialReparacion $h): array
    {
        $fotos = $h->fotos ?? [];
        if (empty($fotos) && $h->foto_path) {
            $fotos = [$h->foto_path];
        }

        $urls = array_map(
            fn ($p) => $p ? asset('storage/' . $p) : null,
            $fotos
        );
        $urls = array_values(array_filter($urls));

        return [
            'id' => $h->id,
            'equipo' => $h->equipo,
            'descripcion' => $h->descripcion,
            'foto_path' => $h->foto_path,
            'foto_url' => $h->foto_path ? asset('storage/' . $h->foto_path) : null,
            'fotos' => $fotos,
            'fotos_url' => $urls,
            'qr_data' => $h->qr_data,
            'tecnico_id' => $h->tecnico_id,
            'tecnico' => $h->tecnico ? [
                'id' => $h->tecnico->id,
                'code' => $h->tecnico->code,
                'name' => $h->tecnico->name,
                'rol' => $h->tecnico->rol,
            ] : null,
            'created_at' => $h->created_at,
        ];
    }

    private function assertPuedeVer(Request $request, HistorialReparacion $historial): void
    {
        $user = $request->user();
        if ($user->esTecnico() && $historial->tecnico_id !== $user->id) {
            abort(403, 'No puedes ver historial de otro técnico.');
        }
    }
}
