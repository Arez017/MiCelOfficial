<?php

use App\Services\CodigoBloqueoService;
use Carbon\Carbon;

// Clave de PRUEBA compartida con generar_codigo.py --autotest y Policy.kt. No usar en equipos.
const CLAVE_PRUEBA = 'ABCD-EFGH-IJKL-MNOA';

beforeEach(function () {
    config(['cuotalock.zona_horaria' => 'America/La_Paz']);
});

afterEach(function () {
    Carbon::setTestNow();
});

it('genera el mismo código que la app Android y el script de Python', function () {
    expect(CodigoBloqueoService::generar(CLAVE_PRUEBA, 'A1B2C3D4', 20792, 1))->toBe('20792-0001-192178')
        ->and(CodigoBloqueoService::generar(CLAVE_PRUEBA, 'A1B2C3D4', 20792, 2))->toBe('20792-0002-613452')
        ->and(CodigoBloqueoService::generar(CLAVE_PRUEBA, '0F0F0F0F', 20792, 1))->toBe('20792-0001-033390')
        ->and(CodigoBloqueoService::generar(CLAVE_PRUEBA, 'a1b2c3d4', 99999, 7))->toBe('99999-0007-717327');
});

it('da un código distinto en cada emisión, aunque sea la misma fecha', function () {
    $codigos = collect(range(1, 50))->map(fn ($n) => CodigoBloqueoService::generar(CLAVE_PRUEBA, 'A1B2C3D4', 20792, $n));

    expect($codigos->unique())->toHaveCount(50);
});

it('el mismo número de emisión da otro código en otro equipo o con otra clave', function () {
    $base = CodigoBloqueoService::generar(CLAVE_PRUEBA, 'A1B2C3D4', 20792, 1);
    $otraClave = 'ZZZZ-YYYY-XXXX-WWW'.CodigoBloqueoService::verificador('ZZZZYYYYXXXXWWW');

    expect(CodigoBloqueoService::generar(CLAVE_PRUEBA, '0F0F0F0F', 20792, 1))->not->toBe($base)
        ->and(CodigoBloqueoService::generar($otraClave, 'A1B2C3D4', 20792, 1))->not->toBe($base);
});

it('valida la clave de vinculación con su dígito verificador', function () {
    expect(CodigoBloqueoService::normalizarClave('abcd efgh-ijkl mnoa'))->toBe('ABCDEFGHIJKLMNOA')
        ->and(CodigoBloqueoService::normalizarClave('ABCD-EFGH-IJKL-MNOB'))->toBeNull() // verificador mal
        ->and(CodigoBloqueoService::normalizarClave('ABCD-EFGH-IJKL-MNA'))->toBeNull()  // 15 caracteres
        ->and(CodigoBloqueoService::normalizarClave('ABCD-EFGH-IJKL-MN0A'))->toBeNull(); // 0 no es base32
});

it('cuenta los días desde 1970 por día calendario', function () {
    expect(CodigoBloqueoService::diasDesdeEpoch(Carbon::create(2026, 12, 5)))->toBe(20792)
        ->and(CodigoBloqueoService::diasDesdeEpoch(Carbon::create(1970, 1, 1)))->toBe(0);
});

it('rechaza datos inválidos', function (string $clave, string $id, int $dias, int $seq) {
    CodigoBloqueoService::generar($clave, $id, $dias, $seq);
})->with([
    'clave inválida' => ['ABCD-EFGH-IJKL-MNOB', 'A1B2C3D4', 20792, 1],
    'ID inválido' => [CLAVE_PRUEBA, 'ZZZZ1234', 20792, 1],
    'día fuera de rango' => [CLAVE_PRUEBA, 'A1B2C3D4', 100000, 1],
    'emisión 0' => [CLAVE_PRUEBA, 'A1B2C3D4', 20792, 0],
    'emisión > 9999' => [CLAVE_PRUEBA, 'A1B2C3D4', 20792, 10000],
])->throws(InvalidArgumentException::class);

it('usa la fecha de Bolivia como "hoy" aunque el servidor esté en UTC', function () {
    // 21:00 en La Paz del 4/dic = 01:00 UTC del 5/dic. En Bolivia todavía es día 4.
    Carbon::setTestNow(Carbon::create(2026, 12, 5, 1, 0, 0, 'UTC'));

    expect(CodigoBloqueoService::diasDesdeEpoch(CodigoBloqueoService::hoy()))->toBe(20791);
});
