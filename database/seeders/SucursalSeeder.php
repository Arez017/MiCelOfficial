<?php

namespace Database\Seeders;

use App\Models\Sucursal;
use Illuminate\Database\Seeder;

class SucursalSeeder extends Seeder
{
    public function run(): void
    {
        foreach (['KevSolutions', 'Upea'] as $nombre) {
            Sucursal::updateOrCreate(['nombre' => $nombre], ['activa' => true]);
        }
    }
}
