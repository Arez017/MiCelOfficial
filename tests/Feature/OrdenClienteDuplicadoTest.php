<?php

use App\Models\Cliente;
use App\Models\ServiceOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

function personalDeOrdenes(): User
{
    $user = User::factory()->create(['code' => 'U-OC1', 'username' => 'admin_ordenes', 'rol' => 'administrador']);
    Sanctum::actingAs($user);

    return $user;
}

function clienteEgor(): Cliente
{
    return Cliente::create(['code' => 'CLI-001', 'name' => 'Egor Kamado', 'phone' => '59171234567', 'visits' => 1, 'active' => true]);
}

function ordenPara(string $nombre, array $extra = []): array
{
    return array_merge([
        'client' => $nombre, 'phone' => '59171234567', 'device' => 'A56',
        'service' => 'Cambio de pantalla', 'monto' => 150,
    ], $extra);
}

it('pregunta antes de juntar a un cliente nuevo con otro que tiene el mismo teléfono', function () {
    personalDeOrdenes();
    $egor = clienteEgor();

    $this->postJson('/api/orders', ordenPara('Huan Pitochico'))
        ->assertStatus(409)
        ->assertJsonPath('conflicto_cliente.id', $egor->id)
        ->assertJsonPath('conflicto_cliente.name', 'Egor Kamado');

    expect(ServiceOrder::count())->toBe(0)
        ->and(Cliente::count())->toBe(1);
});

it('si es la misma persona, la orden queda en la ficha existente con su nombre', function () {
    personalDeOrdenes();
    $egor = clienteEgor();

    $this->postJson('/api/orders', ordenPara('Huan Pitochico', ['cliente_id' => $egor->id, 'cliente_decision' => 'existente']))
        ->assertCreated()
        ->assertJsonPath('cliente_id', $egor->id)
        ->assertJsonPath('client', 'Egor Kamado');

    expect(Cliente::count())->toBe(1);
});

it('si es otra persona, crea un cliente nuevo para poder darle su cuenta en la app', function () {
    personalDeOrdenes();
    $egor = clienteEgor();

    $respuesta = $this->postJson('/api/orders', ordenPara('Huan Pitochico', ['cliente_decision' => 'nuevo']))
        ->assertCreated()
        ->assertJsonPath('client', 'Huan Pitochico');

    $nuevo = Cliente::where('name', 'Huan Pitochico')->firstOrFail();
    expect($respuesta->json('cliente_id'))->toBe($nuevo->id)
        ->and($nuevo->id)->not->toBe($egor->id);
});

it('con el mismo nombre (aunque cambien mayúsculas o espacios) no pregunta nada', function () {
    personalDeOrdenes();
    $egor = clienteEgor();

    $this->postJson('/api/orders', ordenPara('egor   kamado'))
        ->assertCreated()
        ->assertJsonPath('cliente_id', $egor->id);
});

it('el código del cliente nuevo nunca choca con uno que ya existe', function () {
    personalDeOrdenes();
    // Códigos desalineados con los ids, como pasa tras borrar o unificar clientes
    Cliente::create(['code' => 'CLI-002', 'name' => 'Ana', 'phone' => '70000001', 'visits' => 1, 'active' => true]);
    Cliente::create(['code' => 'CLI-009', 'name' => 'Beto', 'phone' => '70000002', 'visits' => 1, 'active' => true]);

    $this->postJson('/api/orders', ordenPara('Carla Nueva', ['phone' => '70000003']))
        ->assertCreated()
        ->assertJsonMissingPath('aviso');

    expect(Cliente::where('name', 'Carla Nueva')->value('code'))->toBe('CLI-010');
});
