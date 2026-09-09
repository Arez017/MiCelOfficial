<?php

namespace App\Http\Controllers;

use App\Models\StockItem;
use Illuminate\Http\Request;

class StockItemController extends Controller
{
    /**
     * GET /api/stock
     * Reemplaza renderStock(stockData) — cualquier usuario logueado puede ver.
     * Soporta ?q= para buscar (igual que filterStock()) y ?categoria= para filtrar.
     */
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

        return response()->json($query->orderBy('categoria')->orderBy('name')->get());
    }

    public function show(StockItem $stock)
    {
        return response()->json($stock);
    }

    /**
     * POST /api/stock
     * Reemplaza guardarRepuesto() — solo Admin/SuperAdmin.
     */
    public function store(Request $request)
    {
        $this->assertEsAdmin($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'categoria' => ['required', 'string', 'max:100'],
            'qty' => ['nullable', 'integer', 'min:0'],
            'min' => ['nullable', 'integer', 'min:1'],
            'precio' => ['nullable', 'numeric', 'min:0'],
        ]);

        $data['code'] = $this->siguienteCodigo();
        $data['qty'] = $data['qty'] ?? 0;
        $data['min'] = $data['min'] ?? 1;
        $data['precio'] = $data['precio'] ?? 0;

        $item = StockItem::create($data);

        return response()->json($item, 201);
    }

    /**
     * PUT /api/stock/{stock}
     * Reemplaza guardarEdicionRepuesto() — edición completa, solo Admin.
     */
    public function update(Request $request, StockItem $stock)
    {
        $this->assertEsAdmin($request);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'categoria' => ['sometimes', 'string', 'max:100'],
            'qty' => ['sometimes', 'integer', 'min:0'],
            'min' => ['sometimes', 'integer', 'min:1'],
            'precio' => ['sometimes', 'numeric', 'min:0'],
        ]);

        $stock->update($data);

        return response()->json($stock);
    }

    /**
     * PATCH /api/stock/{stock}/ajuste
     * Reemplaza guardarAjusteStock() — set/add/sub, solo Admin.
     * Body: { "operacion": "set|add|sub", "cantidad": 5 }
     */
    public function ajustar(Request $request, StockItem $stock)
    {
        $this->assertEsAdmin($request);

        $data = $request->validate([
            'operacion' => ['required', 'in:set,add,sub'],
            'cantidad' => ['required', 'integer', 'min:0'],
        ]);

        $stock->qty = match ($data['operacion']) {
            'set' => $data['cantidad'],
            'add' => $stock->qty + $data['cantidad'],
            'sub' => max(0, $stock->qty - $data['cantidad']),
        };
        $stock->save();

        return response()->json($stock);
    }

    public function destroy(Request $request, StockItem $stock)
    {
        $this->assertEsAdmin($request);
        $stock->delete();

        return response()->json(['message' => 'Repuesto eliminado.']);
    }

    // ===== Helpers =====

    private function assertEsAdmin(Request $request): void
    {
        if (! $request->user()->esAdministrador()) {
            abort(403, 'Solo un administrador puede modificar el stock.');
        }
    }

    private function siguienteCodigo(): string
    {
        $ultimo = StockItem::orderByDesc('id')->value('id') ?? 0;
        return 'REP-' . str_pad((string) ($ultimo + 1), 3, '0', STR_PAD_LEFT);
    }
}