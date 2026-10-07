<?php

namespace Database\Seeders;

use App\Models\Sucursal;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $kev = Sucursal::where('nombre', 'KevSolutions')->value('id');
        $upea = Sucursal::where('nombre', 'Upea')->value('id');

        $users = [
            ['code' => 'TEC-00', 'username' => 'arez', 'name' => 'Arez Dragneel', 'email' => 'arez@micel.local', 'password' => Hash::make('017'), 'rol' => 'superadmin', 'sucursal_id' => null, 'active' => true],
            ['code' => 'TEC-01', 'username' => 'micel', 'name' => 'Daniel Choque', 'email' => 'micel@micel.local', 'password' => Hash::make('1234'), 'rol' => 'administrador', 'sucursal_id' => null, 'active' => true],
            ['code' => 'TEC-02', 'username' => 'kevsolutions', 'name' => 'Kevin Flores', 'email' => 'kev@micel.local', 'password' => Hash::make('1234'), 'rol' => 'administrador', 'sucursal_id' => null, 'active' => true],
            ['code' => 'TEC-03', 'username' => 'tec03', 'name' => 'Técnico 03', 'email' => 'tec03@micel.local', 'password' => Hash::make('1234'), 'rol' => 'tecnico', 'sucursal_id' => $kev, 'active' => true],
            ['code' => 'TEC-06', 'username' => 'tec06', 'name' => 'Técnico 06', 'email' => 'tec06@micel.local', 'password' => Hash::make('1234'), 'rol' => 'tecnico', 'sucursal_id' => $upea, 'active' => true],
            ['code' => 'TEC-10', 'username' => 'tec10', 'name' => 'Técnico 10', 'email' => 'tec10@micel.local', 'password' => Hash::make('1234'), 'rol' => 'tecnico', 'sucursal_id' => $upea, 'active' => false],
        ];

        foreach ($users as $u) {
            User::updateOrCreate(['username' => $u['username']], $u);
        }
    }
}
