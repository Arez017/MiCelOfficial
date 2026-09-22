<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\StockItemController;
use App\Http\Controllers\ServiceOrderController;
use App\Http\Controllers\ClienteController;
use App\Http\Controllers\VentaController;
use App\Http\Controllers\ReciboController;
use App\Http\Controllers\HistorialReparacionController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\CelularInventarioController;
use App\Http\Controllers\CelularVentaController;
use App\Http\Controllers\SeguimientoController;
use Illuminate\Support\Facades\Route;

// ===== PÚBLICO =====
Route::post('/login', [AuthController::class, 'login']);
Route::get('/seguimiento/{codigo}', [SeguimientoController::class, 'show']);

// ===== PROTEGIDO =====
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // Stock
    Route::get('/stock', [StockItemController::class, 'index']);
    Route::post('/stock', [StockItemController::class, 'store']);
    Route::get('/stock/{stock}', [StockItemController::class, 'show']);
    Route::put('/stock/{stock}', [StockItemController::class, 'update']);
    Route::patch('/stock/{stock}/ajuste', [StockItemController::class, 'ajustar']);
    Route::delete('/stock/{stock}', [StockItemController::class, 'destroy']);

    // Órdenes
    Route::get('/orders', [ServiceOrderController::class, 'index']);
    Route::post('/orders', [ServiceOrderController::class, 'store']);
    Route::get('/orders/{order}', [ServiceOrderController::class, 'show']);
    Route::put('/orders/{order}', [ServiceOrderController::class, 'update']);
    Route::patch('/orders/{order}/estado', [ServiceOrderController::class, 'cambiarEstado']);
    Route::post('/orders/{order}/recibo', [ReciboController::class, 'desdeOrden']);

    // Reportes
    Route::get('/reportes/tecnicos', [ServiceOrderController::class, 'reportePorTecnico']);

    // Clientes
    Route::get('/clientes', [ClienteController::class, 'index']);
    Route::post('/clientes', [ClienteController::class, 'store']);
    Route::get('/clientes/{cliente}', [ClienteController::class, 'show']);
    Route::put('/clientes/{cliente}', [ClienteController::class, 'update']);
    Route::patch('/clientes/{cliente}/visita', [ClienteController::class, 'registrarVisita']);
    Route::delete('/clientes/{cliente}', [ClienteController::class, 'destroy']);

    // Ventas
    Route::get('/ventas', [VentaController::class, 'index']);
    Route::post('/ventas', [VentaController::class, 'store']);
    Route::get('/ventas/resumen', [VentaController::class, 'resumenHoy']);

    // Recibos
    Route::get('/recibos', [ReciboController::class, 'index']);
    Route::post('/recibos', [ReciboController::class, 'store']);
    Route::get('/recibos/{recibo}', [ReciboController::class, 'show']);
    Route::put('/recibos/{recibo}', [ReciboController::class, 'update']);

    // Historial
    Route::get('/historial', [HistorialReparacionController::class, 'index']);
    Route::post('/historial', [HistorialReparacionController::class, 'store']);
    Route::get('/historial/{historial}', [HistorialReparacionController::class, 'show']);

    // Usuarios
    Route::get('/usuarios', [UserController::class, 'index']);
    Route::post('/usuarios', [UserController::class, 'store']);
    Route::put('/usuarios/{user}', [UserController::class, 'update']);
    Route::patch('/usuarios/{user}/activo', [UserController::class, 'toggleActivo']);

    // Perfil
    Route::get('/perfil', [ProfileController::class, 'show']);
    Route::put('/perfil', [ProfileController::class, 'update']);
    Route::put('/perfil/password', [ProfileController::class, 'updatePassword']);
    Route::post('/perfil/foto', [ProfileController::class, 'subirFoto']);

    // Celulares
    Route::get('/celulares/inventario', [CelularInventarioController::class, 'index']);
    Route::post('/celulares/inventario', [CelularInventarioController::class, 'store']);
    Route::get('/celulares/ventas', [CelularVentaController::class, 'index']);
    Route::post('/celulares/ventas', [CelularVentaController::class, 'store']);
    Route::get('/celulares/ventas/{venta}', [CelularVentaController::class, 'show']);
    Route::get('/celulares/resumen', [CelularVentaController::class, 'resumen']);
    Route::get('/celulares/estado-cuenta', [CelularVentaController::class, 'estadoCuenta']);
    Route::patch('/cuotas/{cuota}/pagar', [CelularVentaController::class, 'marcarCuotaPagada']);
});