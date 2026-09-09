<?php

namespace App\Http\Controllers;

use App\Models\Cliente;
use Illuminate\Http\Request;

class ClienteController extends Controller
{
    /**
     * GET /api/clientes
     * Reemplaza renderClientes(clientesData). Soporta ?q= para buscar por nombre/teléfono.
     */
    public function index(Request $request)
    {
        $query = Cliente::query();

        if ($request->filled('q')) {
            $q = $request->string('q');
            $query->where(function ($sub) use ($q) {
                $sub->where('name', 'ilike', "%{$q}%")
                    ->orWhere('phone', 'ilike', "%{$q}%")
                    ->orWhere('code', 'ilike', "%{$q}%");
            });
        }

        return response()->json($query->orderByDesc('last_visit')->get());
    }

    public function show(Cliente $cliente)
    {
        return response()->json($cliente->load('recibos'));
    }

    /**
     * POST /api/clientes
     * Cualquier usuario logueado puede registrar un cliente nuevo
     * (ej. un técnico atendiendo a alguien que llega por primera vez).
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['required', 'string', 'max:30'],
            'branch' => ['nullable', 'string', 'max:100'],
        ]);

        $data['code'] = $this->siguienteCodigo();
        $data['visits'] = 1;
        $data['last_visit'] = now();

        $cliente = Cliente::create($data);

        return response()->json($cliente, 201);
    }

    /**
     * PUT /api/clientes/{cliente}
     * Solo Admin/SuperAdmin puede editar datos ya existentes.
     */
    public function update(Request $request, Cliente $cliente)
    {
        $this->assertEsAdmin($request);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'phone' => ['sometimes', 'string', 'max:30'],
            'branch' => ['nullable', 'string', 'max:100'],
        ]);

        $cliente->update($data);

        return response()->json($cliente);
    }

    /**
     * PATCH /api/clientes/{cliente}/visita
     * Suma una visita y actualiza la fecha — se llama automático cada vez
     * que se crea una orden/recibo para ese cliente (o manual si prefieres).
     */
    public function registrarVisita(Cliente $cliente)
    {
        $cliente->increment('visits');
        $cliente->update(['last_visit' => now()]);

        return response()->json($cliente);
    }

    public function destroy(Request $request, Cliente $cliente)
    {
        $this->assertEsAdmin($request);
        $cliente->delete();

        return response()->json(['message' => 'Cliente eliminado.']);
    }

    // ===== Helpers =====

    private function assertEsAdmin(Request $request): void
    {
        if (! $request->user()->esAdministrador()) {
            abort(403, 'Solo un administrador puede modificar clientes.');
        }
    }

    private function siguienteCodigo(): string
    {
        $ultimo = Cliente::orderByDesc('id')->value('id') ?? 0;
        return 'CLI-' . str_pad((string) ($ultimo + 1), 3, '0', STR_PAD_LEFT);
    }
}