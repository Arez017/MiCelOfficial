<?php

use App\Models\StockItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

function adminDeMontos(): User
{
    $user = User::factory()->create(['code' => 'U-M1', 'username' => 'admin_montos', 'rol' => 'administrador']);
    Sanctum::actingAs($user);

    return $user;
}

function repuestoDePrueba(int $qty = 5, float $precio = 120): StockItem
{
    return StockItem::create([
        'code' => 'REP-T01', 'name' => 'Pantalla de prueba', 'categoria' => 'Pantallas',
        'qty' => $qty, 'min' => 2, 'precio' => $precio,
    ]);
}

// ---------- Stock: negativos rechazados, ceros permitidos (la web pide confirmación)

it('rechaza un repuesto nuevo con precio o stock negativos, con mensaje en español', function () {
    adminDeMontos();

    $this->postJson('/api/stock', ['name' => 'Batería', 'categoria' => 'Baterías', 'precio' => -10, 'qty' => 3])
        ->assertUnprocessable()
        ->assertJsonPath('errors.precio.0', 'El precio no puede ser negativo.');
    $this->postJson('/api/stock', ['name' => 'Batería', 'categoria' => 'Baterías', 'precio' => 10, 'qty' => -3])
        ->assertUnprocessable()
        ->assertJsonPath('errors.qty.0', 'El stock no puede ser negativo.');

    expect(StockItem::count())->toBe(0);
});

it('permite guardar un repuesto con precio y stock en 0', function () {
    adminDeMontos();

    $this->postJson('/api/stock', ['name' => 'Flex de carga', 'categoria' => 'Flex', 'precio' => 0, 'qty' => 0])
        ->assertCreated();
});

it('rechaza editar un repuesto con precio o stock negativos', function () {
    adminDeMontos();
    $rep = repuestoDePrueba();

    $this->putJson("/api/stock/{$rep->id}", ['precio' => -1])->assertUnprocessable();
    $this->putJson("/api/stock/{$rep->id}", ['qty' => -2])->assertUnprocessable();

    expect((float) $rep->fresh()->precio)->toBe(120.0)
        ->and($rep->fresh()->qty)->toBe(5);
});

it('no deja restar más stock del que hay (antes lo dejaba en 0 sin avisar)', function () {
    adminDeMontos();
    $rep = repuestoDePrueba(qty: 3);

    $this->patchJson("/api/stock/{$rep->id}/ajuste", ['modo' => 'sub', 'cantidad' => 5])
        ->assertUnprocessable()
        ->assertJsonPath('errors.cantidad.0', 'No hay suficiente stock: hay 3 unidad(es) y se quieren restar 5.');

    expect($rep->fresh()->qty)->toBe(3);
});

it('restar exactamente lo que hay deja el stock en 0', function () {
    adminDeMontos();
    $rep = repuestoDePrueba(qty: 3);

    $this->patchJson("/api/stock/{$rep->id}/ajuste", ['modo' => 'sub', 'cantidad' => 3])->assertOk();

    expect($rep->fresh()->qty)->toBe(0);
});

it('rechaza una cantidad negativa en el ajuste de stock', function () {
    adminDeMontos();
    $rep = repuestoDePrueba();

    $this->patchJson("/api/stock/{$rep->id}/ajuste", ['modo' => 'add', 'cantidad' => -4])
        ->assertUnprocessable()
        ->assertJsonPath('errors.cantidad.0', 'La cantidad no puede ser negativa.');
});

// ---------- Montos: negativos rechazados en todo el sistema

it('rechaza montos negativos en ventas, órdenes y recibos', function () {
    adminDeMontos();

    $this->postJson('/api/ventas', ['detail' => 'Funda', 'monto' => -20, 'pago' => 'efectivo'])
        ->assertUnprocessable()->assertJsonValidationErrors('monto');
    $this->postJson('/api/orders', ['client' => 'Juan Pérez', 'device' => 'Redmi Note 8', 'service' => 'Pantalla', 'monto' => -50])
        ->assertUnprocessable()->assertJsonValidationErrors('monto');
    $this->postJson('/api/recibos', ['cliente' => 'Juan Pérez', 'equipo' => 'Redmi Note 8', 'servicio' => 'Pantalla', 'monto' => -1, 'pago' => 'efectivo'])
        ->assertUnprocessable()->assertJsonValidationErrors('monto');
});

it('rechaza cupones con descuento negativo o de más de 100 %', function () {
    adminDeMontos();
    $base = ['titulo' => 'Promo', 'codigo' => 'PROMO1', 'descuento_tipo' => 'porcentaje'];

    $this->postJson('/api/cupones', $base + ['descuento_valor' => -5])
        ->assertUnprocessable()->assertJsonPath('errors.descuento_valor.0', 'El descuento no puede ser negativo.');
    $this->postJson('/api/cupones', $base + ['descuento_valor' => 150])
        ->assertUnprocessable()->assertJsonPath('errors.descuento_valor.0', 'Un descuento en porcentaje no puede pasar de 100 %.');
    $this->postJson('/api/cupones', $base + ['descuento_valor' => 15])->assertSuccessful();
    $this->postJson('/api/cupones', ['titulo' => 'Fijo', 'codigo' => 'FIJO200', 'descuento_tipo' => 'monto_fijo', 'descuento_valor' => 200])
        ->assertSuccessful();
});

it('la app del cliente lista los cupones activos (la tabla «cupones» se encuentra)', function () {
    \App\Models\Cupon::create(['titulo' => 'Promo', 'codigo' => 'APP10', 'descuento_tipo' => 'porcentaje', 'descuento_valor' => 10]);
    $cliente = \App\Models\Cliente::create(['code' => 'CLI-M1', 'name' => 'Ana Rojas', 'phone' => '70000099', 'username' => 'ana', 'password' => 'secreto123']);
    Sanctum::actingAs($cliente);

    $this->getJson('/api/cliente/cupones')->assertOk()->assertJsonFragment(['codigo' => 'APP10']);
});
