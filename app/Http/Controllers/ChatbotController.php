<?php

namespace App\Http\Controllers;

use App\Models\Cliente;
use App\Services\Chatbot\AsistenteMicel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POST /api/cliente/chat — Asistente MiCEL de la app de clientes.
 * La lógica (filtro, memoria, IA) está en App\Services\Chatbot\AsistenteMicel.
 */
class ChatbotController extends Controller
{
    public function chat(Request $request, AsistenteMicel $asistente): JsonResponse
    {
        $cliente = $request->user();
        // Los tokens de staff también pasan auth:sanctum: el asistente es solo para clientes.
        abort_unless($cliente instanceof Cliente, 403, 'El asistente es solo para clientes de la app.');

        $data = $request->validate([
            'message' => ['required', 'string', 'max:2000'],
            // La app manda su historial, pero se ignora: la memoria vive en el servidor
            // (un historial enviado por el cliente se puede falsificar).
            'history' => ['nullable', 'array'],
        ]);

        return response()->json($asistente->responder($cliente, $data['message']));
    }
}
