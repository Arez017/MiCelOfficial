<?php

namespace Database\Seeders;

use App\Models\Cliente;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class ClienteSeeder extends Seeder
{
    public function run(): void
    {
        $clientes = [
            ['code' => 'CLI-001', 'name' => 'Arez Dragneel', 'phone' => '72345678', 'branch' => 'KevSolutions', 'visits' => 4, 'last_visit' => '2026-04-25'],
            ['code' => 'CLI-002', 'name' => 'María Condori', 'phone' => '71234567', 'branch' => 'Upea',         'visits' => 2, 'last_visit' => '2026-04-24'],
            ['code' => 'CLI-003', 'name' => 'Carlos Mamani', 'phone' => '70987654', 'branch' => 'KevSolutions', 'visits' => 6, 'last_visit' => '2026-04-23'],
            ['code' => 'CLI-004', 'name' => 'Ana Flores',    'phone' => '69876543', 'branch' => 'Upea',         'visits' => 1, 'last_visit' => '2026-04-22'],
            ['code' => 'CLI-005', 'name' => 'Pedro Ticona',  'phone' => '68765432', 'branch' => 'KevSolutions', 'visits' => 3, 'last_visit' => '2026-04-21'],
            ['code' => 'CLI-006', 'name' => 'Sonia Apaza',   'phone' => '67654321', 'branch' => 'Upea',         'visits' => 1, 'last_visit' => '2026-04-20'],
        ];

        foreach ($clientes as $c) {
            $c['last_visit'] = Carbon::parse($c['last_visit']);
            Cliente::updateOrCreate(['code' => $c['code']], $c);
        }
    }
}