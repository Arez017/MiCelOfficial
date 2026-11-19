<?php

use App\Models\Cliente;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

it('responde al cliente de la app en /api/cliente/chat', function () {
    config(['services.micel_chat.key' => null]);
    Sanctum::actingAs(Cliente::create([
        'code' => 'CLI-1', 'name' => 'Ana', 'phone' => '70000001', 'username' => 'ana', 'password' => 'secreto123', 'coins' => 15,
    ]));

    $this->postJson('/api/cliente/chat', ['message' => 'hola'])
        ->assertOk()
        ->assertJsonPath('source', 'micel')
        ->assertJsonFragment(['reply' => "¡Hola, Ana! 👋 Soy el asistente MiCEL.\nTienes 15 coins. ¿En qué te ayudo? Puedo hablar de tus órdenes, coins, garantía o el taller."]);
});

it('no deja usar el chatbot con un token de staff', function () {
    Sanctum::actingAs(User::factory()->create(['code' => 'U-1', 'username' => 'tec', 'rol' => 'tecnico']));

    $this->postJson('/api/cliente/chat', ['message' => '¿dónde está mi orden?'])->assertForbidden();
});
