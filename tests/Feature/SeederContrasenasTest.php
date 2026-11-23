<?php

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

test('el Super Admin usa su propia contraseña y las cuentas de demostración la suya', function () {
    config([
        'app.seed_password' => 'demo-1234',
        'app.seed_superadmin_password' => 'Solo-Del-Super-Admin-9',
    ]);

    $this->seed(DatabaseSeeder::class);

    $superAdmin = User::where('username', 'arez')->firstOrFail();
    expect(Hash::check('Solo-Del-Super-Admin-9', $superAdmin->password))->toBeTrue()
        ->and(Hash::check('demo-1234', $superAdmin->password))->toBeFalse();

    User::where('username', '!=', 'arez')->get()->each(
        fn (User $usuario) => expect(Hash::check('demo-1234', $usuario->password))->toBeTrue()
    );
});

test('sin contraseñas en el .env el seeder no usa las antiguas del repositorio', function () {
    config(['app.seed_password' => null, 'app.seed_superadmin_password' => null]);

    $this->seed(DatabaseSeeder::class);

    foreach (User::all() as $usuario) {
        expect(Hash::check('1234', $usuario->password))->toBeFalse()
            ->and(Hash::check('017', $usuario->password))->toBeFalse();
    }
});
