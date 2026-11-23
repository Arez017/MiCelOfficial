<?php

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

test('el seeder usa la contraseña definida en SEED_PASSWORD', function () {
    config(['app.seed_password' => 'Clave-De-Prueba-9']);

    $this->seed(DatabaseSeeder::class);

    $admin = User::where('username', 'arez')->firstOrFail();
    expect(Hash::check('Clave-De-Prueba-9', $admin->password))->toBeTrue();
});

test('sin SEED_PASSWORD el seeder no usa las contraseñas antiguas del repositorio', function () {
    config(['app.seed_password' => null]);

    $this->seed(DatabaseSeeder::class);

    foreach (User::all() as $usuario) {
        expect(Hash::check('1234', $usuario->password))->toBeFalse()
            ->and(Hash::check('017', $usuario->password))->toBeFalse();
    }
});
