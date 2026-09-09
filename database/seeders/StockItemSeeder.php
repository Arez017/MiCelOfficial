<?php

namespace Database\Seeders;

use App\Models\StockItem;
use Illuminate\Database\Seeder;

class StockItemSeeder extends Seeder
{
    public function run(): void
    {
        $items = [
            ['code' => 'REP-001', 'name' => 'Pantalla Samsung A32',         'categoria' => 'Pantallas',        'qty' => 2,  'min' => 5,  'precio' => 180],
            ['code' => 'REP-002', 'name' => 'Pantalla Redmi Note 10',       'categoria' => 'Pantallas',        'qty' => 8,  'min' => 5,  'precio' => 160],
            ['code' => 'REP-003', 'name' => 'Pantalla Samsung A12',         'categoria' => 'Pantallas',        'qty' => 6,  'min' => 5,  'precio' => 150],
            ['code' => 'REP-004', 'name' => 'Pantalla iPhone 11',           'categoria' => 'Pantallas',        'qty' => 3,  'min' => 3,  'precio' => 320],
            ['code' => 'REP-005', 'name' => 'Batería Xiaomi Redmi 9',       'categoria' => 'Baterías',         'qty' => 1,  'min' => 4,  'precio' => 60],
            ['code' => 'REP-006', 'name' => 'Batería Samsung A12',          'categoria' => 'Baterías',         'qty' => 6,  'min' => 4,  'precio' => 65],
            ['code' => 'REP-007', 'name' => 'Batería iPhone 11',            'categoria' => 'Baterías',         'qty' => 4,  'min' => 3,  'precio' => 120],
            ['code' => 'REP-008', 'name' => 'Pin de carga USB-C',           'categoria' => 'Conectores',       'qty' => 15, 'min' => 10, 'precio' => 25],
            ['code' => 'REP-009', 'name' => 'Pin de carga Lightning',       'categoria' => 'Conectores',       'qty' => 3,  'min' => 5,  'precio' => 40],
            ['code' => 'REP-010', 'name' => 'Lámina Backlight 6.5"',        'categoria' => 'Retroiluminación', 'qty' => 7,  'min' => 3,  'precio' => 55],
            ['code' => 'REP-011', 'name' => 'Flex cámara Redmi 9',          'categoria' => 'Flex',             'qty' => 0,  'min' => 3,  'precio' => 45],
            ['code' => 'REP-012', 'name' => 'Flex cámara Samsung A32',      'categoria' => 'Flex',             'qty' => 5,  'min' => 3,  'precio' => 50],
            ['code' => 'REP-013', 'name' => 'Parlante Samsung A32',         'categoria' => 'Audio',            'qty' => 4,  'min' => 2,  'precio' => 35],
            ['code' => 'REP-014', 'name' => 'Micrófono Motorola G30',       'categoria' => 'Audio',            'qty' => 2,  'min' => 2,  'precio' => 30],
            ['code' => 'REP-015', 'name' => 'Mica templada 6.5" universal', 'categoria' => 'Accesorios',       'qty' => 20, 'min' => 10, 'precio' => 10],
        ];

        foreach ($items as $item) {
            StockItem::updateOrCreate(['code' => $item['code']], $item);
        }
    }
}