<?php

use App\Services\CodigoBloqueoService;
use Carbon\Carbon;

beforeEach(function () {
    config(['cuotalock.secret' => 'CAMBIA-ESTA-CLAVE-SECRETA']);
});

it('genera el mismo código que la app Android y el script de Python', function () {
    expect(CodigoBloqueoService::generar('A1B2C3D4', 20792))->toBe('20792-188885');
});

it('genera el código de liberación sin importar mayúsculas', function () {
    expect(CodigoBloqueoService::liberacion('a1b2c3d4'))->toBe('99999-679956');
});

it('cuenta los días desde 1970 por día calendario', function () {
    expect(CodigoBloqueoService::diasDesdeEpoch(Carbon::create(2026, 12, 5)))->toBe(20792);
});

it('rechaza generar códigos si falta la clave secreta', function () {
    config(['cuotalock.secret' => '']);

    CodigoBloqueoService::generar('A1B2C3D4', 20792);
})->throws(RuntimeException::class);
