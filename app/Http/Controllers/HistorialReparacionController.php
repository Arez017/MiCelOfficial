<?php

namespace App\Http\Controllers;

use App\Models\HistorialReparacion;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Schema;

class HistorialReparacionController extends Controller
{
    /**
     * GET /api/historial
     * Biblioteca compartida: Admin, SuperAdmin y TODOS los técnicos ven todo.
     */
    public function index(Request $request)
    {
        $query = HistorialReparacion::with('tecnico');

        // Sin filtro por tecnico_id — Amnesis es biblioteca de todo el equipo

        return response()->json(
            $query->orderByDesc('id')->get()->map(fn ($h) => $this->format($h))
        );
    }

    public function show(Request $request, HistorialReparacion $historial)
    {
        // Cualquier usuario autenticado (staff) puede ver cualquier entrada
        return response()->json($this->format($historial->load('tecnico')));
    }

    /**
     * POST /api/historial — multipart:
     * equipo*, descripcion?, foto?, fotos[]?
     * Cualquier técnico/admin logueado puede agregar.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'equipo' => ['required', 'string', 'max:255'],
            'descripcion' => ['nullable', 'string'],
            'foto' => ['nullable', 'file', 'max:10240'],
            'fotos' => ['nullable', 'array', 'max:12'],
            'fotos.*' => ['nullable', 'file', 'max:10240'],
        ]);

        $user = $request->user();
        $paths = [];

        $allFiles = [];
        if ($request->hasFile('fotos')) {
            $uploaded = $request->file('fotos');
            if (is_array($uploaded)) {
                foreach ($uploaded as $file) {
                    if ($file) {
                        $allFiles[] = $file;
                    }
                }
            } elseif ($uploaded) {
                $allFiles[] = $uploaded;
            }
        }
        if ($request->hasFile('foto')) {
            $allFiles[] = $request->file('foto');
        }

        foreach ($allFiles as $file) {
            if (! $file || ! $file->isValid()) {
                continue;
            }
            $mime = (string) $file->getMimeType();
            $ext = strtolower($file->getClientOriginalExtension() ?: '');
            $okMime = str_starts_with($mime, 'image/');
            $okExt = in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'], true);
            if (! $okMime && ! $okExt) {
                continue;
            }
            $paths[] = $file->store('historial', 'public');
        }

        $paths = array_values(array_unique($paths));
        $portada = $paths[0] ?? null;

        $payload = [
            'equipo' => $data['equipo'],
            'descripcion' => $data['descripcion'] ?? null,
            'foto_path' => $portada,
            'tecnico_id' => $user->id,
            'qr_data' => Str::uuid()->toString(),
        ];

        if (Schema::hasColumn('historial_reparaciones', 'fotos')) {
            $payload['fotos'] = $paths ?: null;
        }

        $historial = HistorialReparacion::create($payload);

        return response()->json($this->format($historial->load('tecnico')), 201);
    }

    private function format(HistorialReparacion $h): array
    {
        $fotos = [];
        if (isset($h->fotos) && is_array($h->fotos)) {
            $fotos = $h->fotos;
        } elseif (! empty($h->attributes['fotos'] ?? null)) {
            $decoded = json_decode($h->attributes['fotos'], true);
            if (is_array($decoded)) {
                $fotos = $decoded;
            }
        }
        if (empty($fotos) && $h->foto_path) {
            $fotos = [$h->foto_path];
        }

        $urls = array_values(array_filter(array_map(
            fn ($p) => $p ? asset('storage/'.ltrim($p, '/')) : null,
            $fotos
        )));

        return [
            'id' => $h->id,
            'equipo' => $h->equipo,
            'descripcion' => $h->descripcion,
            'foto_path' => $h->foto_path,
            'foto_url' => $h->foto_path ? asset('storage/'.ltrim($h->foto_path, '/')) : null,
            'fotos' => $fotos,
            'fotos_url' => $urls,
            'qr_data' => $h->qr_data,
            'tecnico_id' => $h->tecnico_id,
            'tecnico' => $h->tecnico ? [
                'id' => $h->tecnico->id,
                'code' => $h->tecnico->code,
                'name' => $h->tecnico->name,
                'rol' => $h->tecnico->rol ?? null,
            ] : null,
            'created_at' => $h->created_at,
        ];
    }
}
