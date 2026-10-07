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
        $query = Cliente::with('sucursal');

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
        return response()->json($cliente->load(['recibos', 'sucursal']));
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
            'sucursal_id' => ['nullable', 'exists:sucursales,id'],
        ]);

        $data['code'] = $this->siguienteCodigo();
        $data['visits'] = 1;
        $data['last_visit'] = now();

        $cliente = Cliente::create($data);

        return response()->json($cliente->load('sucursal'), 201);
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
            'sucursal_id' => ['nullable', 'exists:sucursales,id'],
        ]);

        $cliente->update($data);

        return response()->json($cliente->load('sucursal'));
    }

    /**
     * PATCH /api/clientes/{cliente}/cuenta
     * Crea o resetea el usuario/contraseña de la app móvil para este cliente.
     * Solo Admin/SuperAdmin. El cliente no se autorregistra: el staff le
     * da de alta la cuenta cuando corresponde (ej. al entregar su equipo).
     */
    public function gestionarCuenta(Request $request, Cliente $cliente)
    {
        $this->assertEsAdmin($request);

        $data = $request->validate([
            'username' => ['required', 'string', 'max:50', 'unique:clientes,username,' . $cliente->id],
            'password' => ['required', 'string', 'min:4'],
        ]);

        $cliente->update($data);

        return response()->json($cliente->fresh());
    }

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
