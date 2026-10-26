<?php

namespace App\Http\Controllers;

use App\Models\StockItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class StockItemController extends Controller
{
    public function index(Request $request)
    {
        $query = StockItem::query();

        if ($request->filled('q')) {
            $q = $request->string('q');
            $query->where(function ($sub) use ($q) {
                $sub->where('name', 'ilike', "%{$q}%")
                    ->orWhere('categoria', 'ilike', "%{$q}%")
                    ->orWhere('code', 'ilike', "%{$q}%");
            });
        }

        if ($request->filled('categoria') && $request->categoria !== 'all') {
            $query->where('categoria', $request->categoria);
        }

        return response()->json(
            $query->orderBy('categoria')->orderBy('name')->get()->map(fn ($s) => $this->format($s))
        );
    }

    public function show(StockItem $stock)
    {
        return response()->json($this->format($stock));
    }

    public function store(Request $request)
    {
        $this->assertEsAdmin($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'categoria' => ['required', 'string', 'max:100'],
            'qty' => ['nullable', 'integer', 'min:0'],
            'min' => ['nullable', 'integer', 'min:1'],
            'precio' => ['nullable', 'numeric', 'min:0'],
            'foto' => ['nullable', 'image', 'max:3072'],
            'foto_url' => ['nullable', 'string', 'max:1000'],
            'auto_foto' => ['nullable', 'boolean'],
        ]);

        $data['code'] = $this->siguienteCodigo();
        $data['qty'] = $data['qty'] ?? 0;
        $data['min'] = $data['min'] ?? 1;
        $data['precio'] = $data['precio'] ?? 0;

        if ($request->hasFile('foto')) {
            $data['foto_path'] = $request->file('foto')->store('stock', 'public');
        } elseif (! empty($data['foto_url'])) {
            $data['foto_path'] = $data['foto_url']; // URL externa libre
        } elseif ($request->boolean('auto_foto')) {
            $url = $this->buscarImagenLibre($data['name'], $data['categoria']);
            if ($url) {
                $data['foto_path'] = $url;
            }
        }
        unset($data['foto'], $data['foto_url'], $data['auto_foto']);

        $item = StockItem::create($data);

        return response()->json($this->format($item), 201);
    }

    public function update(Request $request, StockItem $stock)
    {
        $this->assertEsAdmin($request);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'categoria' => ['sometimes', 'string', 'max:100'],
            'qty' => ['sometimes', 'integer', 'min:0'],
            'min' => ['sometimes', 'integer', 'min:1'],
            'precio' => ['sometimes', 'numeric', 'min:0'],
            'foto' => ['nullable', 'image', 'max:3072'],
            'foto_url' => ['nullable', 'string', 'max:1000'],
            'auto_foto' => ['nullable', 'boolean'],
        ]);

        if ($request->hasFile('foto')) {
            if ($stock->foto_path && ! str_starts_with((string) $stock->foto_path, 'http')) {
                Storage::disk('public')->delete($stock->foto_path);
            }
            $data['foto_path'] = $request->file('foto')->store('stock', 'public');
        } elseif ($request->filled('foto_url')) {
            $data['foto_path'] = $request->input('foto_url');
        } elseif ($request->boolean('auto_foto')) {
            $name = $data['name'] ?? $stock->name;
            $cat = $data['categoria'] ?? $stock->categoria;
            $url = $this->buscarImagenLibre($name, $cat);
            if ($url) {
                $data['foto_path'] = $url;
            }
        }
        unset($data['foto'], $data['foto_url'], $data['auto_foto']);

        $stock->update($data);

        return response()->json($this->format($stock->fresh()));
    }

    /**
     * GET /api/stock/buscar-foto?q=Pantalla+Samsung+A12&categoria=Pantallas
     * Devuelve una imagen de uso libre (Openverse / CC) sin guardar aún.
     */
    public function buscarFoto(Request $request)
    {
        $q = $request->string('q')->toString() ?: $request->string('name')->toString();
        $cat = $request->string('categoria')->toString();

        if ($q === '' && $cat === '') {
            return response()->json(['message' => 'Indica nombre o categoría'], 422);
        }

        $url = $this->buscarImagenLibre($q, $cat);

        if (! $url) {
            return response()->json([
                'ok' => false,
                'message' => 'No se encontró imagen libre para esa búsqueda',
                'foto_url' => null,
            ], 404);
        }

        return response()->json([
            'ok' => true,
            'foto_url' => $url,
            'fuente' => 'Openverse (Creative Commons / dominio público)',
            'aviso' => 'Imagen de uso libre según licencia CC. Verificar licencia si se usa en producción comercial.',
        ]);
    }

    public function ajustar(Request $request, StockItem $stock)
    {
        $this->assertEsAdmin($request);

        $data = $request->validate([
            'modo' => ['sometimes', 'in:set,add,sub'],
            'operacion' => ['sometimes', 'in:set,add,sub'],
            'cantidad' => ['required', 'integer', 'min:0'],
        ]);

        $modo = $data['modo'] ?? $data['operacion'] ?? 'set';
        $qty = (int) $stock->qty;
        if ($modo === 'set') {
            $qty = $data['cantidad'];
        } elseif ($modo === 'add') {
            $qty += $data['cantidad'];
        } else {
            $qty = max(0, $qty - $data['cantidad']);
        }

        $stock->update(['qty' => $qty]);

        return response()->json($this->format($stock->fresh()));
    }

    public function destroy(Request $request, StockItem $stock)
    {
        $this->assertEsAdmin($request);
        if ($stock->foto_path && ! str_starts_with((string) $stock->foto_path, 'http')) {
            Storage::disk('public')->delete($stock->foto_path);
        }
        $stock->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * Busca en Openverse (fotos CC / dominio público).
     * Fallback: placeholder temático (no es foto real del producto).
     */
    private function buscarImagenLibre(string $nombre, string $categoria = ''): ?string
    {
        $query = trim($nombre.' '.$categoria.' smartphone repair part');
        $query = preg_replace('/\s+/', ' ', $query);

        try {
            $res = Http::timeout(8)
                ->withHeaders(['User-Agent' => 'MiCelStock/1.0 (academic demo)'])
                ->get('https://api.openverse.org/v1/images/', [
                    'q' => $query,
                    'page_size' => 5,
                    'license' => 'cc0,pdm,by,by-sa', // más permisivas
                    'license_type' => 'commercial,modification',
                ]);

            if ($res->successful()) {
                $results = $res->json('results') ?? [];
                foreach ($results as $img) {
                    $url = $img['url'] ?? $img['thumbnail'] ?? null;
                    if ($url && str_starts_with($url, 'http')) {
                        return $url;
                    }
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Openverse foto libre: '.$e->getMessage());
        }

        // Fallback Wikimedia Commons
        try {
            $res = Http::timeout(8)
                ->get('https://commons.wikimedia.org/w/api.php', [
                    'action' => 'query',
                    'generator' => 'search',
                    'gsrsearch' => $nombre ?: $categoria,
                    'gsrlimit' => 3,
                    'gsrnamespace' => 6, // File
                    'prop' => 'imageinfo',
                    'iiprop' => 'url',
                    'format' => 'json',
                ]);

            if ($res->successful()) {
                $pages = $res->json('query.pages') ?? [];
                foreach ($pages as $page) {
                    $url = $page['imageinfo'][0]['url'] ?? null;
                    if ($url) {
                        return $url;
                    }
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Wikimedia foto libre: '.$e->getMessage());
        }

        return null;
    }

    private function format(StockItem $s): array
    {
        $fotoUrl = $s->foto_url;
        // Si foto_path es URL http, usarla directo
        if (! $fotoUrl && $s->foto_path && str_starts_with((string) $s->foto_path, 'http')) {
            $fotoUrl = $s->foto_path;
        }

        return [
            'id' => $s->id,
            'code' => $s->code,
            'name' => $s->name,
            'categoria' => $s->categoria,
            'qty' => $s->qty,
            'min' => $s->min,
            'precio' => (float) $s->precio,
            'foto_path' => $s->foto_path,
            'foto_url' => $fotoUrl,
            'sin_stock' => $s->sin_stock,
            'es_critico' => $s->es_critico,
            'porcentaje' => $s->porcentaje,
        ];
    }

    private function assertEsAdmin(Request $request): void
    {
        $user = $request->user();
        $rol = strtolower((string) ($user->rol ?? ''));
        if (! in_array($rol, ['administrador', 'admin', 'superadmin', 'super_admin', 'super admin'], true)
            && ! (method_exists($user, 'esAdmin') && $user->esAdmin())
            && ! (method_exists($user, 'esSuperAdmin') && $user->esSuperAdmin())) {
            abort(403, 'Solo Admin / Super Admin.');
        }
    }

    private function siguienteCodigo(): string
    {
        $ultimo = StockItem::orderByDesc('id')->value('id') ?? 0;

        return 'REP-'.str_pad((string) ($ultimo + 1), 3, '0', STR_PAD_LEFT);
    }
}
