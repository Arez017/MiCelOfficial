<?php

namespace Database\Seeders;

use App\Models\Cliente;
use Illuminate\Database\Seeder;

class ClienteSeeder extends Seeder
{
    public function run(): void
    {
        // Solo ejemplos para defensa. Los reales se crean al registrar órdenes.
        $clientes = [
            [
                'code' => 'CLI-001',
                'name' => 'Juan Quispe',
                'phone' => '72345678',
                'branch' => 'KevSolutions',
                'visits' => 2,
                'last_visit' => now()->toDateString(),
            ],
            [
                'code' => 'CLI-002',
                'name' => 'María Condori',
                'phone' => '71234567',
                'branch' => 'Upea',
                'visits' => 1,
                'last_visit' => now()->subDay()->toDateString(),
            ],
            [
                'code' => 'CLI-003',
                'name' => 'Carlos Mamani',
                'phone' => '70987654',
                'branch' => 'KevSolutions',
                'visits' => 3,
                'last_visit' => now()->subDays(2)->toDateString(),
            ],
        ];

        foreach ($clientes as $c) {
            Cliente::updateOrCreate(['code' => $c['code']], $c);
        }
    }
}