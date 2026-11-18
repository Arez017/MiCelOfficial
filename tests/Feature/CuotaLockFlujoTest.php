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

/** Venta a crédito con 3 cuotas mensuales desde hoy + 10 días y un equipo vinculado. */
function crearEquipoACredito(): Dispositivo
{
    $invId = DB::table('celulares_inventario')->insertGetId([
        'codigo' => 'CELINV-001', 'modelo' => 'Galaxy A15', 'imei' => '350000000000001',
        'estado' => 'Nuevo', 'precio_compra' => 900, 'created_at' => now(), 'updated_at' => now(),
    ]);
    $ventaId = DB::table('celulares_ventas')->insertGetId([
        'codigo' => 'CEL-001', 'celular_inventario_id' => $invId, 'cliente' => 'Juan Perez',
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

    return Dispositivo::create(['celular_venta_id' => $ventaId, 'device_id' => 'A1B2C3D4']);
}

function loginAdmin(): User
{
    $user = User::factory()->create(['code' => 'U-1', 'username' => 'admin', 'rol' => 'administrador']);
    Sanctum::actingAs($user);

    return $user;
}

it('genera el código de pago con la clave configurada', function () {
    config(['cuotalock.secret' => 'CAMBIA-ESTA-CLAVE-SECRETA']);
    loginAdmin();
    $d = crearEquipoACredito();

    $r = $this->postJson("/api/dispositivos/{$d->id}/codigo")->assertOk();

    $vence = Carbon::parse(Cuota::orderBy('numero')->first()->fecha_vencimiento)->addDays(3);
    expect($r->json('codigo'))->toBe(CodigoBloqueoService::paraFecha('A1B2C3D4', $vence))
        ->and($r->json('vence_en'))->toBe($vence->toDateString());
});

it('avisa claramente si falta CUOTALOCK_SECRET al generar código', function () {
    config(['cuotalock.secret' => null]);
    loginAdmin();
    $d = crearEquipoACredito();

    $this->postJson("/api/dispositivos/{$d->id}/codigo")
        ->assertStatus(503)
        ->assertJsonFragment(['message' => CodigoBloqueoService::ERROR_SIN_CLAVE]);
});

it('registra el pago aunque no se pueda emitir el código', function () {
    config(['cuotalock.secret' => '']);
    loginAdmin();
    crearEquipoACredito();
    $cuota = Cuota::orderBy('numero')->first();

    $this->patchJson("/api/cuotas/{$cuota->id}/pagar")
        ->assertOk()
        ->assertJsonPath('pagada', true)
        ->assertJsonPath('bloqueo.codigo', null)
        ->assertJsonPath('bloqueo.error', CodigoBloqueoService::ERROR_SIN_CLAVE);

    expect($cuota->fresh()->pagada)->toBeTrue();
});

it('al pagar una cuota entrega el código para la siguiente', function () {
    config(['cuotalock.secret' => 'CAMBIA-ESTA-CLAVE-SECRETA']);
    loginAdmin();
    crearEquipoACredito();
    [$primera, $segunda] = Cuota::orderBy('numero')->take(2)->get();

    $r = $this->patchJson("/api/cuotas/{$primera->id}/pagar")->assertOk();

    $vence = Carbon::parse($segunda->fecha_vencimiento)->addDays(3);
    expect($r->json('bloqueo.codigo'))->toBe(CodigoBloqueoService::paraFecha('A1B2C3D4', $vence))
        ->and($r->json('bloqueo.error'))->toBeNull();
});
