<?php

namespace App\Services\Chatbot;

use App\Models\Cliente;
use App\Models\ServiceOrder;
use Illuminate\Support\Str;

/**
 * Respuestas fijas del taller: se usan cuando no hay IA configurada o la IA falla.
 * Los datos salen de config/chatbot.php y de la base de datos.
 */
class RespuestasTaller
{
    public static function para(string $msg, Cliente $cliente, bool $esQueja = false): string
    {
        $n = config('chatbot.negocio');
        $t = Str::lower(Str::ascii($msg));
        $nombre = Str::before(trim((string) $cliente->name), ' ') ?: 'cliente';

        if ($esQueja) {
            return "Lamento mucho la molestia, {$nombre}. Quiero que lo resuelvan bien: pásame el código de tu orden y escríbele al taller ({$n['contacto']}) para que un encargado revise tu caso directamente.";
        }

        if (preg_match('/\b(orden|ordenes|reparacion|seguimiento|estado|donde esta|como va|listo)\b/u', $t)) {
            return "Te cuento cómo van tus equipos:\n".self::ordenes($cliente)."\nEl detalle completo lo ves en la pestaña Seguimiento.";
        }

        if (preg_match('/\b(coin|coins|puntos|vip|fidelidad|canje)\b/u', $t)) {
            $vip = ! empty($cliente->es_vip) ? 'y ya eres VIP ⭐' : 'y aún no eres VIP';

            return "Tienes {$cliente->coins} MiCEL Coins {$vip}. Los ganas al completar reparaciones y sirven para beneficios y canjes según las promociones del local. Míralos en la pestaña Coins.";
        }

        if (preg_match('/\b(garantia|garantias|reclamo)\b/u', $t)) {
            return "Garantías MiCEL:\n- ".implode("\n- ", $n['garantias']);
        }

        if (preg_match('/\b(precio|precios|costo|cuanto|cotizacion)\b/u', $t)) {
            return "Precios referenciales:\n- ".implode("\n- ", $n['precios_referenciales'])."\nEl técnico te confirma el monto exacto según el modelo.";
        }

        if (preg_match('/\b(horario|hora|abren|cierran|direccion|ubicacion|sucursal|donde quedan)\b/u', $t)) {
            $horario = Str::startsWith(Str::lower($n['horario']), 'consultar')
                ? 'El horario exacto te lo confirman en la sucursal'
                : "Atendemos {$n['horario']}";

            return "{$horario}. Estamos en {$n['zona']}. Para cualquier consulta: {$n['contacto']}.";
        }

        if (preg_match('/\b(que llevo|llevar|documentos|requisitos)\b/u', $t)) {
            return 'Al dejar tu equipo trae el celular (y si puedes el cargador), la contraseña o patrón y cuéntale al técnico la falla. Te dan una orden con código de seguimiento.';
        }

        if (preg_match('/\b(hola|buenas|buen dia|hey|que tal)\b/u', $t)) {
            return "¡Hola, {$nombre}! 👋 ¿En qué te ayudo hoy? Puedo contarte cómo va tu reparación, tus coins, las garantías o los horarios del taller.";
        }

        // Fallas del equipo: sin IA no se diagnostica, pero se orienta al cliente.
        if (preg_match('/\b(pantalla|tactil|touch|display|no carga|carga|cargador|pin de carga|bateria|se apaga|se reinicia|'
            .'no prende|no enciende|se mojo|mojado|agua|camara|microfono|parlante|altavoz|audio|sonido|no suena|wifi|senal|'
            .'lento|se calienta|falla|fallas|problema|problemas|roto|rota|rajado|se vuelve loco|se vuelve loca|fantasma|'
            .'no funciona|se trabo|se cuelga)\b/u', $t)) {
            return "Uy, {$nombre}, eso conviene que lo revise un técnico 🔧. Trae tu equipo al taller con su cargador y la contraseña o patrón; "
                ."te damos una orden con código para que sigas la reparación desde la app. Consultas: {$n['contacto']}. "
                .'Si quieres, te cuento los precios referenciales.';
        }

        if (preg_match('/\b(gracias|adios|chau|nos vemos)\b/u', $t)) {
            return '¡Con gusto! Aquí estoy cuando me necesites 🔧';
        }

        return "Puedo ayudarte con:\n- Cómo va tu reparación\n- Tus MiCEL Coins\n- Garantías y precios referenciales\n- Horarios y qué llevar al taller\n¿Sobre cuál te cuento?";
    }

    private static function ordenes(Cliente $cliente): string
    {
        $estados = ['recepcion' => 'recibido', 'diagnostico' => 'en diagnóstico', 'en_proceso' => 'en reparación', 'listo' => 'listo para recoger ✅'];

        try {
            $ordenes = ServiceOrder::where(function ($q) use ($cliente) {
                $q->where('cliente_id', $cliente->id);
                if (! empty($cliente->phone)) {
                    $q->orWhere('phone', $cliente->phone);
                }
            })->orderByDesc('id')->limit(3)->get(['code', 'status', 'device']);
        } catch (\Throwable $e) {
            return '(no pude consultar tus órdenes ahora)';
        }

        if ($ordenes->isEmpty()) {
            return 'No encontré órdenes a tu nombre. Si tienes un código (ej. OS-0012), búscalo en Seguimiento.';
        }

        return $ordenes->map(fn ($o) => "- {$o->code}: {$o->device} — ".($estados[$o->status] ?? $o->status))->implode("\n");
    }
}
