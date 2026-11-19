<?php

use App\Services\Chatbot\ModeracionChat;

it('detecta groserías aunque las escriban trampeadas', function (string $texto) {
    expect((new ModeracionChat)->analizar($texto))->toBe(ModeracionChat::GROSERO);
})->with([
    'eres un idiota',
    'IMBÉCIL',
    'p u t a',
    'p.u.t.a madre',
    'puuuuuta',
    'm1erd4 de servicio',
    'cojudo de mierda',
    'la concha de tu madre',
    'hdp',
    'mierrda',
    'chinga tú madre v:',
    'perra',
    'me vale verga bro',
    'eres un hijueputa',
    'vete al carajo',
]);

it('detecta contenido obsceno', function (string $texto) {
    expect((new ModeracionChat)->analizar($texto))->toBe(ModeracionChat::OBSCENO);
})->with(['mandame nudes', 'quiero ver porno', 'te gusta el sexo?', 'masturbarse']);

it('detecta amenazas', function () {
    expect((new ModeracionChat)->analizar('si no me arreglan voy a quemar el local'))->toBe(ModeracionChat::AMENAZA);
});

it('trata los reclamos fuertes como queja, no como insulto', function (string $texto) {
    expect((new ModeracionChat)->analizar($texto))->toBe(ModeracionChat::QUEJA);
})->with(['son unos estafadores', 'pésimo servicio', 'esto es una porquería']);

it('no bloquea mensajes normales con palabras parecidas', function (string $texto) {
    expect((new ModeracionChat)->analizar($texto))->toBeNull();
})->with([
    'mi computadora no prende',
    'tengo una disputa con la garantía',
    'me robaron el celular, qué hago?',
    '¿dónde está mi orden OS-0012?',
    'la pantalla está rota',
    'cuánto cuesta el cambio de batería',
    'vete a la sucursal de la ceja',
    'tengo 3 coins',
    'el pack de accesorios',
    'mi perro mordió el cargador',
    'el celular es de mi mamá',
]);
