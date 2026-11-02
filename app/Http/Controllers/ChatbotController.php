<?php

namespace App\Http\Controllers;

use App\Models\ServiceOrder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Chatbot demo MiCEL — respuestas locales del taller + IA opcional (.env).
 *
 * .env opcionales:
 *   MICEL_CHAT_API_KEY=...
 *   MICEL_CHAT_BASE_URL=https://api.x.ai/v1   (o https://api.openai.com/v1)
 *   MICEL_CHAT_MODEL=grok-2-latest            (o gpt-4o-mini)
 */
class ChatbotController extends Controller
{
    public function chat(Request $request)
    {
        $data = $request->validate([
            'message' => ['required', 'string', 'max:2000'],
            'history' => ['nullable', 'array'],
            'history.*.role' => ['nullable', 'string'],
            'history.*.content' => ['nullable', 'string'],
        ]);

        $msg = trim($data['message']);
        $cliente = $request->user(); // Cliente autenticado (Sanctum)

        // 1) Respuestas rápidas del negocio (siempre funcionan, ideal demo)
        $local = $this->respuestaLocal($msg, $cliente);
        if ($local !== null) {
            return response()->json([
                'reply' => $local,
                'source' => 'micel',
            ]);
        }

        // 2) IA externa si hay API key
        $apiKey = config('services.micel_chat.key') ?: env('MICEL_CHAT_API_KEY');
        if ($apiKey) {
            try {
                $ai = $this->llamarIA($msg, $data['history'] ?? [], $cliente, $apiKey);
                if ($ai) {
                    return response()->json([
                        'reply' => $ai,
                        'source' => 'ia',
                    ]);
                }
            } catch (\Throwable $e) {
                report($e);
            }
        }

        // 3) Fallback amable
        return response()->json([
            'reply' => "Puedo ayudarte con:\n"
                ."• Estado de tu reparación / seguimiento\n"
                ."• MiCEL Coins y VIP\n"
                ."• Horarios y sucursales\n"
                ."• Garantía y qué llevar al taller\n\n"
                .'Escribe por ejemplo: "¿dónde está mi orden?" o "¿qué son los coins?"',
            'source' => 'fallback',
        ]);
    }

    private function respuestaLocal(string $msg, $cliente): ?string
    {
        $t = Str::lower(Str::ascii($msg));

        // Saludos
        if (preg_match('/\b(hola|buenas|buen dia|hey|hi)\b/u', $t)) {
            $nombre = $cliente->name ?? 'cliente';
            $coins = $cliente->coins ?? 0;

            return "¡Hola, {$nombre}! 👋 Soy el asistente MiCEL.\n"
                ."Tienes {$coins} coins. ¿En qué te ayudo? Puedo hablar de tus órdenes, coins, garantía o el taller.";
        }

        // Coins / VIP
        if (preg_match('/\b(coin|coins|puntos|vip|fidelidad|canje)\b/u', $t)) {
            $coins = $cliente->coins ?? 0;
            $vip = ! empty($cliente->es_vip) ? 'Sí, eres VIP ⭐' : 'Aún no eres VIP';

            return "🪙 **MiCEL Coins**\n"
                ."• Ganas coins al completar reparaciones en el taller.\n"
                ."• Tus coins actuales: **{$coins}**\n"
                ."• VIP: {$vip}\n"
                ."• Sirven para beneficios y canjes según las promociones del local.\n"
                .'Revisa la pestaña Coins en la app.';
        }

        // Seguimiento / orden
        if (preg_match('/\b(orden|ordenes|reparacion|seguimiento|estado|donde esta|como va)\b/u', $t)) {
            $extra = '';
            try {
                $ordenes = ServiceOrder::where(function ($q) use ($cliente) {
                    $q->where('cliente_id', $cliente->id);
                    if (! empty($cliente->phone)) {
                        $q->orWhere('phone', $cliente->phone);
                    }
                })
                    ->orderByDesc('id')
                    ->limit(3)
                    ->get(['code', 'status', 'device', 'service']);

                if ($ordenes->isNotEmpty()) {
                    $lineas = $ordenes->map(function ($o) {
                        return "• {$o->code}: {$o->device} — {$o->service} [{$o->status}]";
                    })->implode("\n");
                    $extra = "\n\nTus últimas órdenes:\n{$lineas}";
                } else {
                    $extra = "\n\nNo encontré órdenes ligadas a tu cuenta. Si tienes un código (ej. OS-0012), úsalo en la pestaña Seguimiento.";
                }
            } catch (\Throwable $e) {
                $extra = "\n\nUsa la pestaña **Seguimiento** con el código de tu orden.";
            }

            return "📱 **Seguimiento de reparación**\n"
                ."En la app entra a **Seguimiento** e ingresa el código de tu orden (te lo dan en el taller).{$extra}";
        }

        // Garantía
        if (preg_match('/\b(garantia|reclamo|falla otra vez)\b/u', $t)) {
            return "🛡️ **Garantías MiCEL**\n"
                ."• Cambio de pantalla: **3 meses**\n"
                ."• Cambio de batería: **6 meses**\n"
                ."• Pin / conectores: **2 meses**\n"
                ."• Software: **15 días**\n"
                .'No cubre golpes, humedad ni fallas distintas. Trae tu recibo u orden.';
        }

        // Horario / ubicación
        if (preg_match('/\b(horario|hora|abren|cierran|direccion|ubicacion|sucursal|donde quedan)\b/u', $t)) {
            return "📍 **Taller MiCEL**\n"
                ."• Zona: El Alto / sucursales configuradas en el sistema\n"
                ."• Horario típico de atención: consulta en local (demo)\n"
                ."• Lleva tu equipo, contraseña/patrón si aplica y el recibo.\n"
                .'El personal del taller te confirma horarios exactos.';
        }

        // Qué llevar
        if (preg_match('/\b(que llevo|llevar|documentos|requisitos)\b/u', $t)) {
            return "🧳 **Al dejar tu equipo**\n"
                ."• Celular + (opcional) cargador\n"
                ."• Contraseña o patrón de desbloqueo\n"
                ."• Descripción de la falla\n"
                .'Te entregan orden de trabajo / recibo con código de seguimiento.';
        }

        // Precio
        if (preg_match('/\b(precio|costo|cuanto cuesta|cotizacion)\b/u', $t)) {
            return "💰 **Precios referenciales**\n"
                ."• Pantalla: Bs 180–350\n"
                ."• Batería: Bs 80–150\n"
                ."• Pin de carga: Bs 50–120\n"
                ."• Flasheo: Bs 40–80\n"
                .'El técnico confirma el monto exacto según el modelo.';
        }

        // Gracias / adiós
        if (preg_match('/\b(gracias|adios|chau|nos vemos)\b/u', $t)) {
            return '¡Con gusto! Si necesitas algo más, aquí estaré. 🔧 — MiCEL';
        }

        // Quién eres
        if (preg_match('/\b(quien eres|que eres|bot|asistente)\b/u', $t)) {
            return 'Soy el **asistente virtual de MiCEL**, el sistema del taller de servicio técnico de celulares. Te oriento sobre órdenes, coins y el servicio.';
        }

        return null;
    }

    private function llamarIA(string $msg, array $history, $cliente, string $apiKey): ?string
    {
        $base = rtrim(env('MICEL_CHAT_BASE_URL', 'https://api.x.ai/v1'), '/');
        $model = env('MICEL_CHAT_MODEL', 'grok-2-latest');

        $system = 'Eres el asistente de MiCEL, taller de reparación de celulares en Bolivia (El Alto). '
            .'Responde en español, breve y claro. Ayuda con seguimiento de reparaciones, coins, garantía y atención. '
            .'No inventes precios exactos. Si no sabes algo, indica ir al taller. '
            .'Cliente: '.($cliente->name ?? 'cliente').' | coins: '.($cliente->coins ?? 0);

        $messages = [
            ['role' => 'system', 'content' => $system],
        ];

        foreach (array_slice($history, -8) as $h) {
            $role = ($h['role'] ?? '') === 'assistant' ? 'assistant' : 'user';
            $content = trim((string) ($h['content'] ?? ''));
            if ($content !== '') {
                $messages[] = ['role' => $role, 'content' => $content];
            }
        }
        $messages[] = ['role' => 'user', 'content' => $msg];

        $res = Http::timeout(25)
            ->withToken($apiKey)
            ->acceptJson()
            ->post($base.'/chat/completions', [
                'model' => $model,
                'messages' => $messages,
                'temperature' => 0.5,
            ]);

        if (! $res->successful()) {
            return null;
        }

        return $res->json('choices.0.message.content');
    }
}
