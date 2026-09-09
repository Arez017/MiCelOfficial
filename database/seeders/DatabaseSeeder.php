<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            UserSeeder::class,         // primero: todo depende de users (tecnico_id FKs)
            StockItemSeeder::class,
            ClienteSeeder::class,
            ServiceOrderSeeder::class, // depende de UserSeeder
        ]);
    }
}