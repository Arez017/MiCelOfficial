<?php

use App\Services\CodigoBloqueoService;
use Carbon\Carbon;

beforeEach(function () {
    config([
        'cuotalock.secret' => 'CAMBIA-ESTA-CLAVE-SECRETA',
        'cuotalock.zona_horaria' => 'America/La_Paz',
    ]);
});

afterEach(function () {
    Carbon::setTestNow();
});

// Vectores compartidos con Policy.kt (PolicyTest) y herramientas/generar_codigo.py.
it('genera el mismo código que la app Android y el script de Python', function () {
    expect(CodigoBloqueoService::generar('A1B2C3D4', 20792))->toBe('20792-188885');
    expect(CodigoBloqueoService::generar('A1B2C3D4', 20790))->toBe('20790-328725');
    expect(CodigoBloqueoService::generar('A1B2C3D4', 20800))->toBe('20800-955529');
    expect(CodigoBloqueoService::generar('0F0F0F0F', 20792))->toBe('20792-037945');
});

it('genera el código de liberación sin importar mayúsculas', function () {
    expect(CodigoBloqueoService::liberacion('a1b2c3d4'))->toBe('99999-679956');
});

it('cuenta los días desde 1970 por día calendario', function () {
    expect(CodigoBloqueoService::diasDesdeEpoch(Carbon::create(2026, 12, 5)))->toBe(20792);
    expect(CodigoBloqueoService::diasDesdeEpoch(Carbon::create(1970, 1, 1)))->toBe(0);
});

it('rechaza generar códigos si falta la clave secreta', function () {
    config(['cuotalock.secret' => '']);

    CodigoBloqueoService::generar('A1B2C3D4', 20792);
})->throws(RuntimeException::class);

it('rechaza un ID de equipo con formato inválido', function () {
    CodigoBloqueoService::generar('ZZZZ1234', 20792);
})->throws(InvalidArgumentException::class);

it('rechaza un día fuera de rango', function () {
    CodigoBloqueoService::generar('A1B2C3D4', 100000);
})->throws(InvalidArgumentException::class);

it('usa la fecha de Bolivia como "hoy" aunque el servidor esté en UTC', function () {
    // 21:00 en La Paz del 4/dic = 01:00 UTC del 5/dic. En Bolivia todavía es día 4.
    Carbon::setTestNow(Carbon::create(2026, 12, 5, 1, 0, 0, 'UTC'));

    expect(CodigoBloqueoService::diasDesdeEpoch(CodigoBloqueoService::hoy()))->toBe(20791);
});
