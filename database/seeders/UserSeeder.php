<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $usuarios = [
            ['code' => 'TEC-00', 'username' => 'arez',          'name' => 'Arez Dragneel', 'password' => '017',  'rol' => 'superadmin',    'branch' => 'Ambas',         'active' => true],
            ['code' => 'TEC-01', 'username' => 'micel',         'name' => 'Daniel Choque', 'password' => '1234', 'rol' => 'administrador', 'branch' => 'Ambas',         'active' => true],
            ['code' => 'TEC-02', 'username' => 'kevsolutions',  'name' => 'Kevin Flores',  'password' => '1234', 'rol' => 'administrador', 'branch' => 'Ambas',         'active' => true],
            ['code' => 'TEC-03', 'username' => 'tec03',         'name' => 'Técnico 03',    'password' => '1234', 'rol' => 'tecnico',       'branch' => 'KevSolutions',  'active' => true],
            ['code' => 'TEC-04', 'username' => 'tec04',         'name' => 'Técnico 04',    'password' => '1234', 'rol' => 'tecnico',       'branch' => 'KevSolutions',  'active' => true],
            ['code' => 'TEC-05', 'username' => 'tec05',         'name' => 'Técnico 05',    'password' => '1234', 'rol' => 'tecnico',       'branch' => 'KevSolutions',  'active' => true],
            ['code' => 'TEC-06', 'username' => 'tec06',         'name' => 'Técnico 06',    'password' => '1234', 'rol' => 'tecnico',       'branch' => 'Upea',          'active' => true],
            ['code' => 'TEC-07', 'username' => 'tec07',         'name' => 'Técnico 07',    'password' => '1234', 'rol' => 'tecnico',       'branch' => 'Upea',          'active' => true],
            ['code' => 'TEC-08', 'username' => 'tec08',         'name' => 'Técnico 08',    'password' => '1234', 'rol' => 'tecnico',       'branch' => 'Upea',          'active' => true],
            ['code' => 'TEC-09', 'username' => 'tec09',         'name' => 'Técnico 09',    'password' => '1234', 'rol' => 'tecnico',       'branch' => 'KevSolutions',  'active' => true],
            ['code' => 'TEC-10', 'username' => 'tec10',         'name' => 'Técnico 10',    'password' => '1234', 'rol' => 'tecnico',       'branch' => 'Upea',          'active' => false],
        ];

        foreach ($usuarios as $u) {
            User::updateOrCreate(
                ['username' => $u['username']],
                [
                    'code' => $u['code'],
                    'name' => $u['name'],
                    'email' => $u['username'] . '@micel.test', // placeholder, users no lo usan para login
                    'password' => Hash::make($u['password']),
                    'rol' => $u['rol'],
                    'branch' => $u['branch'],
                    'active' => $u['active'],
                ]
            );
        }
    }
}