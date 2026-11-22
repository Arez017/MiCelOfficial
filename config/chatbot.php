<?php

/*
|--------------------------------------------------------------------------
| Asistente MiCEL (chatbot de la app de clientes)
|--------------------------------------------------------------------------
| Todo lo que el asistente "sabe" del negocio sale de aquí: si cambia un
| horario, un precio o una garantía, edítalo aquí y corre
| php artisan config:clear. Los datos del cliente (coins, órdenes) se leen
| de la base de datos en cada mensaje.
*/

return [

    // IA compatible con OpenAI (OpenAI, Gemini, xAI, Groq...). Sin api_key el
    // asistente responde solo con las respuestas fijas del taller.
    'ia' => [
        'api_key' => env('MICEL_CHAT_API_KEY'),
        'base_url' => env('MICEL_CHAT_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai'),
        'modelo' => env('MICEL_CHAT_MODEL', 'gemini-3.5-flash-lite'),
        // Menor que el límite de PHP (max_execution_time = 30 s): si la IA tarda más,
        // se corta y responde el plan B en vez de romper la petición con un error 500.
        'timeout' => (int) env('MICEL_CHAT_TIMEOUT', 18),
        // Los modelos Gemini 3 "piensan" antes de responder y ese pensamiento también
        // gasta tokens: con un límite bajo la respuesta llega vacía. Las respuestas
        // igual salen cortas porque las instrucciones piden máximo 6 líneas.
        'max_tokens' => (int) env('MICEL_CHAT_MAX_TOKENS', 2048),
        // low = piensa poco y responde rápido (Gemini/OpenAI). Vacío = el modelo decide
        // cuánto pensar: con preguntas de diagnóstico Gemini puede pasar de los 18 s
        // y responde el plan B. Déjalo vacío solo para proveedores que no lo aceptan
        // (por ejemplo Groq con Llama).
        'reasoning_effort' => env('MICEL_CHAT_REASONING', 'low'),
    ],

    'negocio' => [
        'nombre' => 'MiCEL',
        'descripcion' => 'taller de servicio técnico y venta de celulares',
        'zona' => 'El Alto, Bolivia',
        // EDITA: pon el horario real (ej. 'Lunes a sábado de 9:00 a 19:00'). Mientras diga
        // "consultar", el asistente no inventa horarios y manda a preguntar al local.
        'horario' => 'consultar en la sucursal',
        'contacto' => 'WhatsApp del taller o directamente en la sucursal',
        'garantias' => [
            'Cambio de pantalla: 3 meses',
            'Cambio de batería: 6 meses',
            'Pin / conectores: 2 meses',
            'Software: 15 días',
            'No cubre golpes, humedad ni fallas distintas a la reparada. Hay que traer el recibo u orden.',
        ],
        'precios_referenciales' => [
            'Pantalla: Bs 180–350',
            'Batería: Bs 80–150',
            'Pin de carga: Bs 50–120',
            'Flasheo / software: Bs 40–80',
        ],
        // Agrega aquí lo que quieras que el asistente sepa (promociones, políticas, etc.)
        'conocimientos' => [
            'Los clientes ganan MiCEL Coins al completar reparaciones; sirven para beneficios y canjes según las promociones vigentes.',
            'El seguimiento de una reparación se ve en la pestaña Seguimiento de la app con el código de la orden (ej. OS-0012).',
            'Al dejar un equipo conviene traer el cargador, la contraseña o patrón y describir la falla.',
            'También se venden celulares al contado y a crédito en cuotas.',
        ],
    ],

    'moderacion' => [
        'avisos_para_pausa' => 3,   // mensajes ofensivos...
        'ventana_minutos' => 10,    // ...dentro de esta ventana
        'pausa_minutos' => 15,      // pausa del chat después de eso
    ],

    'memoria' => [
        'mensajes' => 12,           // cuántos mensajes previos recuerda en cada respuesta
        'retener_dias' => 90,       // luego se borran solos (php artisan model:prune)
    ],

];
