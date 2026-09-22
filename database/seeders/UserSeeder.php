<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $users = [
            [
                'code' => 'TEC-00',
                'username' => 'arez',
                'name' => 'Arez Dragneel',
                'email' => 'arez@micel.local',
                'password' => Hash::make('017'),
                'rol' => 'superadmin',
                'branch' => 'Ambas',
                'active' => true,
            ],
            [
                'code' => 'TEC-01',
                'username' => 'micel',
                'name' => 'Daniel Choque',
                'email' => 'micel@micel.local',
                'password' => Hash::make('1234'),
                'rol' => 'administrador',
                'branch' => 'Ambas',
                'active' => true,
            ],
            [
                'code' => 'TEC-02',
                'username' => 'kevsolutions',
                'name' => 'Kevin Flores',
                'email' => 'kev@micel.local',
                'password' => Hash::make('1234'),
                'rol' => 'administrador',
                'branch' => 'Ambas',
                'active' => true,
            ],
            [
                'code' => 'TEC-03',
                'username' => 'tec03',
                'name' => 'Técnico 03',
                'email' => 'tec03@micel.local',
                'password' => Hash::make('1234'),
                'rol' => 'tecnico',
                'branch' => 'KevSolutions',
                'active' => true,
            ],
            [
                'code' => 'TEC-06',
                'username' => 'tec06',
                'name' => 'Técnico 06',
                'email' => 'tec06@micel.local',
                'password' => Hash::make('1234'),
                'rol' => 'tecnico',
                'branch' => 'Upea',
                'active' => true,
            ],
            [
                'code' => 'TEC-10',
                'username' => 'tec10',
                'name' => 'Técnico 10',
                'email' => 'tec10@micel.local',
                'password' => Hash::make('1234'),
                'rol' => 'tecnico',
                'branch' => 'Upea',
                'active' => false,
            ],
        ];

        foreach ($users as $u) {
            User::updateOrCreate(['username' => $u['username']], $u);
        }
    }
}