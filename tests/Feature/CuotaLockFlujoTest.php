<?php

use App\Models\Cuota;
use App\Models\Dispositivo;
use App\Models\User;
use App\Services\CodigoBloqueoService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

const CLAVE_EQUIPO = 'ABCD-EFGH-IJKL-MNOA';

/** Venta a crédito con 3 cuotas mensuales desde hoy + 10 días (sin equipo vinculado). */
function crearVentaACredito(string $sufijo = '1'): int
{
    $invId = DB::table('celulares_inventario')->insertGetId([
        'codigo' => "CELINV-{$sufijo}", 'modelo' => 'Galaxy A15', 'imei' => "35000000000000{$sufijo}",
        'estado' => 'Nuevo', 'precio_compra' => 900, 'created_at' => now(), 'updated_at' => now(),
    ]);
    $ventaId = DB::table('celulares_ventas')->insertGetId([
        'codigo' => "CEL-{$sufijo}", 'celular_inventario_id' => $invId, 'cliente' => 'Juan Perez',
        'precio_venta' => 1500, 'metodo_pago' => 'cuotas', 'created_at' => now(), 'updated_at' => now(),
    ]);
    $planId = DB::table('planes_pago')->insertGetId([
        'celular_venta_id' => $ventaId, 'total' => 1500, 'inicial' => 300, 'saldo' => 1200,
        'numero_cuotas' => 3, 'created_at' => now(), 'updated_at' => now(),
    ]);
    foreach ([1, 2, 3] as $n) {
        DB::table('cuotas')->insert([
            'plan_pago_id' => $planId, 'numero' => $n, 'monto' => 400,
            'fecha_vencimiento' => now()->addDays(10)->addMonths($n - 1)->toDateString(),
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    return $ventaId;
}

function crearEquipoACredito(?string $clave = CLAVE_EQUIPO): Dispositivo
{
    return Dispositivo::create([
        'celular_venta_id' => crearVentaACredito(),
        'device_id' => 'A1B2C3D4',
        'clave' => $clave ? CodigoBloqueoService::normalizarClave($clave) : null,
    ]);
}

function loginAdmin(): User
{
    $user = User::factory()->create(['code' => 'U-1', 'username' => 'admin', 'rol' => 'administrador']);
    Sanctum::actingAs($user);

    return $user;
}

function venceSegunCuota(int $numero): Carbon
{
    return Carbon::parse(Cuota::where('numero', $numero)->first()->fecha_vencimiento)->addDays(3);
}

it('vincula con la clave del equipo y emite el código de activación #1', function () {
    loginAdmin();
    $ventaId = crearVentaACredito();

    $r = $this->postJson('/api/dispositivos', [
        'celular_venta_id' => $ventaId, 'device_id' => 'a1b2c3d4', 'clave' => 'abcd efgh ijkl mnoa',
    ])->assertCreated();

    $dias = CodigoBloqueoService::diasDesdeEpoch(venceSegunCuota(1));
    expect($r->json('codigo'))->toBe(CodigoBloqueoService::generar(CLAVE_EQUIPO, 'A1B2C3D4', $dias, 1))
        ->and($r->json('dispositivo.tiene_clave'))->toBeTrue()
        ->and($r->json('dispositivo'))->not->toHaveKey('clave');

    // La clave se guarda cifrada, nunca en texto plano
    expect(DB::table('dispositivos')->value('clave'))->not->toContain('ABCDEFGHIJKLMNOA');
});

it('rechaza vincular con una clave mal escrita', function () {
    loginAdmin();

    $this->postJson('/api/dispositivos', [
        'celular_venta_id' => crearVentaACredito(), 'device_id' => 'A1B2C3D4', 'clave' => 'ABCD-EFGH-IJKL-MNOB',
    ])->assertStatus(422)->assertJsonValidationErrors('clave');
});

it('cada clic en «Generar código» da un código nuevo con número de emisión mayor', function () {
    loginAdmin();
    $d = crearEquipoACredito();

    $c1 = $this->postJson("/api/dispositivos/{$d->id}/codigo")->assertOk()->json('codigo');
    $c2 = $this->postJson("/api/dispositivos/{$d->id}/codigo")->assertOk()->json('codigo');

    $dias = CodigoBloqueoService::diasDesdeEpoch(venceSegunCuota(1));
    expect($c1)->toBe(CodigoBloqueoService::generar(CLAVE_EQUIPO, 'A1B2C3D4', $dias, 1))
        ->and($c2)->toBe(CodigoBloqueoService::generar(CLAVE_EQUIPO, 'A1B2C3D4', $dias, 2))
        ->and($c1)->not->toBe($c2)
        ->and($d->fresh()->secuencia)->toBe(2);
});

it('cada liberación es un código nuevo', function () {
    loginAdmin();
    $d = crearEquipoACredito();
    Cuota::query()->update(['pagada' => true]);

    $l1 = $this->postJson("/api/dispositivos/{$d->id}/liberar")->assertOk()->json('codigo');
    $l2 = $this->postJson("/api/dispositivos/{$d->id}/liberar")->assertOk()->json('codigo');

    expect($l1)->toStartWith('99999-0001-')->and($l2)->toStartWith('99999-0002-')
        ->and($d->codigos()->where('tipo', 'liberacion')->count())->toBe(2);
});

it('sin clave de vinculación avisa y no emite', function () {
    loginAdmin();
    $d = crearEquipoACredito(null);

    $this->postJson("/api/dispositivos/{$d->id}/codigo")
        ->assertStatus(422)
        ->assertJsonFragment(['message' => CodigoBloqueoService::ERROR_SIN_CLAVE]);
});

it('carga la clave de un equipo viejo y reinicia el contador', function () {
    loginAdmin();
    $d = crearEquipoACredito(null);
    $d->update(['secuencia' => 5]);

    $this->putJson("/api/dispositivos/{$d->id}/clave", ['clave' => CLAVE_EQUIPO])
        ->assertOk()->assertJsonPath('dispositivo.tiene_clave', true);

    expect($d->fresh()->secuencia)->toBe(0)
        ->and($this->postJson("/api/dispositivos/{$d->id}/codigo")->json('codigo'))->toContain('-0001-');
});

it('registra el pago aunque no se pueda emitir el código', function () {
    loginAdmin();
    crearEquipoACredito(null);
    $cuota = Cuota::orderBy('numero')->first();

    $this->patchJson("/api/cuotas/{$cuota->id}/pagar")
        ->assertOk()
        ->assertJsonPath('pagada', true)
        ->assertJsonPath('bloqueo.codigo', null)
        ->assertJsonPath('bloqueo.error', CodigoBloqueoService::ERROR_SIN_CLAVE);

    expect($cuota->fresh()->pagada)->toBeTrue();
});

it('al pagar una cuota entrega el código para la siguiente', function () {
    loginAdmin();
    crearEquipoACredito();
    $primera = Cuota::orderBy('numero')->first();

    $r = $this->patchJson("/api/cuotas/{$primera->id}/pagar")->assertOk();

    $dias = CodigoBloqueoService::diasDesdeEpoch(venceSegunCuota(2));
    expect($r->json('bloqueo.codigo'))->toBe(CodigoBloqueoService::generar(CLAVE_EQUIPO, 'A1B2C3D4', $dias, 1))
        ->and($r->json('bloqueo.error'))->toBeNull();
});
