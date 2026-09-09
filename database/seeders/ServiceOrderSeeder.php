<?php

namespace Database\Seeders;

use App\Models\ServiceOrder;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class ServiceOrderSeeder extends Seeder
{
    // Mapea el texto que usabas en el JS al valor real del enum en la BD
    private array $statusMap = [
        'Recepción'   => 'recepcion',
        'Diagnóstico' => 'diagnostico',
        'En proceso'  => 'en_proceso',
        'Listo'       => 'listo',
    ];

    public function run(): void
    {
        $ordenes = [
            ['code' => '#OS-0041', 'client' => 'Juan Quispe',   'phone' => '72345678', 'device' => 'Samsung A32',    'service' => 'Cambio de pantalla', 'techCode' => 'TEC-03', 'branch' => 'KevSolutions', 'status' => 'Listo',       'date' => '2026-04-25', 'monto' => 280, 'obs' => 'Pantalla original instalada. Garantía 30 días.'],
            ['code' => '#OS-0040', 'client' => 'María Condori', 'phone' => '71234567', 'device' => 'Xiaomi Redmi 9', 'service' => 'Cambio de batería',  'techCode' => 'TEC-06', 'branch' => 'Upea',         'status' => 'En proceso',  'date' => '2026-04-25', 'monto' => 120, 'obs' => 'Batería marca compatible.'],
            ['code' => '#OS-0039', 'client' => 'Carlos Mamani', 'phone' => '70987654', 'device' => 'iPhone 11',      'service' => 'Pin de carga',       'techCode' => 'TEC-04', 'branch' => 'KevSolutions', 'status' => 'Diagnóstico', 'date' => '2026-04-24', 'monto' => 0,   'obs' => 'En espera de diagnóstico.'],
            ['code' => '#OS-0038', 'client' => 'Ana Flores',    'phone' => '69876543', 'device' => 'Huawei P30',     'service' => 'Flasheo / Firmware', 'techCode' => 'TEC-07', 'branch' => 'Upea',         'status' => 'Listo',       'date' => '2026-04-24', 'monto' => 80,  'obs' => 'Firmware actualizado correctamente.'],
            ['code' => '#OS-0037', 'client' => 'Pedro Ticona',  'phone' => '68765432', 'device' => 'Motorola G30',   'service' => 'Backlight',          'techCode' => 'TEC-05', 'branch' => 'KevSolutions', 'status' => 'En proceso',  'date' => '2026-04-23', 'monto' => 160, 'obs' => 'Requiere lámina backlight 6.5".'],
            ['code' => '#OS-0036', 'client' => 'Sonia Apaza',   'phone' => '67654321', 'device' => 'Samsung A12',    'service' => 'Cambio de pantalla', 'techCode' => 'TEC-08', 'branch' => 'Upea',         'status' => 'Recepción',   'date' => '2026-04-23', 'monto' => 0,   'obs' => 'Recién ingresado.'],
        ];

        foreach ($ordenes as $o) {
            $tecnico = User::where('code', $o['techCode'])->first();

            ServiceOrder::updateOrCreate(
                ['code' => $o['code']],
                [
                    'client' => $o['client'],
                    'phone' => $o['phone'],
                    'device' => $o['device'],
                    'service' => $o['service'],
                    'tecnico_id' => $tecnico?->id,
                    'branch' => $o['branch'],
                    'status' => $this->statusMap[$o['status']] ?? 'recepcion',
                    'monto' => $o['monto'],
                    'obs' => $o['obs'],
                    'created_at' => Carbon::parse($o['date']),
                ]
            );
        }
    }
}