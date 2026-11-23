<?php

namespace Database\Seeders;

use App\Models\Sucursal;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        // Las contraseñas no van en el código: se toman del .env. La del Super
        // Admin va aparte (SEED_SUPERADMIN_PASSWORD) para no compartirla con las
        // cuentas de demostración (SEED_PASSWORD). Si falta alguna, se genera
        // una al azar y se muestra una sola vez en la consola.
        $hash = Hash::make($this->clave('app.seed_password', 'los usuarios de ejemplo'));
        $hashSuperAdmin = Hash::make($this->clave('app.seed_superadmin_password', 'el Super Admin'));

        $kev = Sucursal::where('nombre', 'KevSolutions')->value('id');
        $upea = Sucursal::where('nombre', 'Upea')->value('id');

        $users = [
            ['code' => 'TEC-00', 'username' => 'arez', 'name' => 'Arez Dragneel', 'email' => 'arez@micel.local', 'password' => $hashSuperAdmin, 'rol' => 'superadmin', 'sucursal_id' => null, 'active' => true],
            ['code' => 'TEC-01', 'username' => 'micel', 'name' => 'Daniel Choque', 'email' => 'micel@micel.local', 'password' => $hash, 'rol' => 'administrador', 'sucursal_id' => null, 'active' => true],
            ['code' => 'TEC-02', 'username' => 'kevsolutions', 'name' => 'Kevin Flores', 'email' => 'kev@micel.local', 'password' => $hash, 'rol' => 'administrador', 'sucursal_id' => null, 'active' => true],
            ['code' => 'TEC-03', 'username' => 'tec03', 'name' => 'Técnico 03', 'email' => 'tec03@micel.local', 'password' => $hash, 'rol' => 'tecnico', 'sucursal_id' => $kev, 'active' => true],
            ['code' => 'TEC-06', 'username' => 'tec06', 'name' => 'Técnico 06', 'email' => 'tec06@micel.local', 'password' => $hash, 'rol' => 'tecnico', 'sucursal_id' => $upea, 'active' => true],
            ['code' => 'TEC-10', 'username' => 'tec10', 'name' => 'Técnico 10', 'email' => 'tec10@micel.local', 'password' => $hash, 'rol' => 'tecnico', 'sucursal_id' => $upea, 'active' => false],
        ];

        foreach ($users as $u) {
            User::updateOrCreate(['username' => $u['username']], $u);
        }
    }

    private function clave(string $llave, string $para): string
    {
        $clave = config($llave);

        if (! $clave) {
            $clave = Str::password(12, symbols: false);
            $this->command?->warn("Contraseña generada para {$para}: {$clave}");
        }

        return $clave;
    }
}
