<?php

namespace Database\Seeders;

use App\Models\ServiceOrder;
use App\Models\User;
use Illuminate\Database\Seeder;

class ServiceOrderSeeder extends Seeder
{
    public function run(): void
    {
        $tec03 = User::where('username', 'tec03')->first();
        $tec06 = User::where('username', 'tec06')->first();

        $ordenes = [
            [
                'code' => '#OS-0041',
                'client' => 'Juan Quispe',
                'phone' => '72345678',
                'device' => 'Samsung A32',
                'service' => 'Cambio de pantalla',
                'tecnico_id' => $tec03?->id,
                'branch' => 'KevSolutions',
                'status' => 'listo',
                'monto' => 280,
                'obs' => 'Pantalla original. Garantía 30 días.',
            ],
            [
                'code' => '#OS-0040',
                'client' => 'María Condori',
                'phone' => '71234567',
                'device' => 'Xiaomi Redmi 9',
                'service' => 'Cambio de batería',
                'tecnico_id' => $tec06?->id,
                'branch' => 'Upea',
                'status' => 'en_proceso',
                'monto' => 120,
                'obs' => 'Batería compatible.',
            ],
            [
                'code' => '#OS-0039',
                'client' => 'Carlos Mamani',
                'phone' => '70987654',
                'device' => 'iPhone 11',
                'service' => 'Pin de carga',
                'tecnico_id' => $tec03?->id,
                'branch' => 'KevSolutions',
                'status' => 'diagnostico',
                'monto' => 0,
                'obs' => 'En espera de diagnóstico.',
            ],
        ];

        foreach ($ordenes as $o) {
            ServiceOrder::updateOrCreate(['code' => $o['code']], $o);
        }
    }
}