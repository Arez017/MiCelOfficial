<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\StockItemController;
use App\Http\Controllers\ServiceOrderController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ClienteController;
use App\Http\Controllers\VentaController;
use App\Http\Controllers\ReciboController;
use App\Http\Controllers\HistorialReparacionController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\CelularInventarioController;
use App\Http\Controllers\CelularVentaController;
use App\Http\Controllers\SucursalController;
use App\Http\Controllers\SeguimientoController;
use App\Http\Controllers\ClienteAuthController;
use App\Http\Controllers\CuponController;

// ===== PÚBLICO =====
// Login de staff (Admin/Técnico) — todavía no hay token en este punto
Route::post('/login', [AuthController::class, 'login']);

// Seguimiento sin cuenta: cualquiera con el código de su orden puede consultarla
Route::get('/seguimiento/{codigo}', [SeguimientoController::class, 'show']);

// Login de la app móvil — SOLO clientes, cuenta separada del staff
Route::post('/cliente/login', [ClienteAuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // Sucursales
    Route::get('/sucursales', [SucursalController::class, 'index']);
    Route::post('/sucursales', [SucursalController::class, 'store']);
    Route::get('/sucursales/{sucursal}', [SucursalController::class, 'show']);
    Route::put('/sucursales/{sucursal}', [SucursalController::class, 'update']);
    Route::patch('/sucursales/{sucursal}/activa', [SucursalController::class, 'toggleActiva']);
    Route::delete('/sucursales/{sucursal}', [SucursalController::class, 'destroy']);

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

    // Comisión de técnicos
    Route::get('/reportes/tecnicos', [ServiceOrderController::class, 'reportePorTecnico']);

    // Clientes
    Route::get('/clientes', [ClienteController::class, 'index']);
    Route::post('/clientes', [ClienteController::class, 'store']);
    Route::get('/clientes/{cliente}', [ClienteController::class, 'show']);
    Route::put('/clientes/{cliente}', [ClienteController::class, 'update']);
    Route::patch('/clientes/{cliente}/visita', [ClienteController::class, 'registrarVisita']);
    Route::patch('/clientes/{cliente}/cuenta', [ClienteController::class, 'gestionarCuenta']);
    Route::delete('/clientes/{cliente}', [ClienteController::class, 'destroy']);

    // Sesión de cliente (app móvil) — comparte el mismo middleware auth:sanctum,
    // pero el token pertenece a un Cliente, no a un User.
    Route::post('/cliente/logout', [ClienteAuthController::class, 'logout']);
    Route::get('/cliente/me', [ClienteAuthController::class, 'me']);
    Route::get('/cliente/mis-ordenes', [ClienteAuthController::class, 'misOrdenes']);
    Route::get('/cliente/cupones', [ClienteAuthController::class, 'cupones']);

    // Cupones (gestión de staff — solo Admin/SuperAdmin, validado en el controlador)
    Route::get('/cupones', [CuponController::class, 'index']);
    Route::post('/cupones', [CuponController::class, 'store']);
    Route::put('/cupones/{cupon}', [CuponController::class, 'update']);
    Route::delete('/cupones/{cupon}', [CuponController::class, 'destroy']);

    // Ventas
    Route::get('/ventas', [VentaController::class, 'index']);
    Route::post('/ventas', [VentaController::class, 'store']);
    Route::get('/ventas/resumen', [VentaController::class, 'resumenHoy']);

    // Recibos
    Route::get('/recibos', [ReciboController::class, 'index']);
    Route::post('/recibos', [ReciboController::class, 'store']);
    Route::get('/recibos/{recibo}', [ReciboController::class, 'show']);
    Route::put('/recibos/{recibo}', [ReciboController::class, 'update']);

    // Historial de reparaciones
    Route::get('/historial', [HistorialReparacionController::class, 'index']);
    Route::post('/historial', [HistorialReparacionController::class, 'store']);
    Route::get('/historial/{historial}', [HistorialReparacionController::class, 'show']);

    // Usuarios / Técnicos
    Route::get('/usuarios', [UserController::class, 'index']);
    Route::post('/usuarios', [UserController::class, 'store']);
    Route::put('/usuarios/{user}', [UserController::class, 'update']);
    Route::patch('/usuarios/{user}/activo', [UserController::class, 'toggleActivo']);

    // Perfil (autoedición de cada usuario)
    Route::get('/perfil', [ProfileController::class, 'show']);
    Route::put('/perfil', [ProfileController::class, 'update']);
    Route::put('/perfil/password', [ProfileController::class, 'updatePassword']);
    Route::post('/perfil/foto', [ProfileController::class, 'subirFoto']);

    // Venta de celulares — inventario
    Route::get('/celulares/inventario', [CelularInventarioController::class, 'index']);
    Route::post('/celulares/inventario', [CelularInventarioController::class, 'store']);

    // Venta de celulares — ventas y cuotas
    Route::get('/celulares/ventas', [CelularVentaController::class, 'index']);
    Route::post('/celulares/ventas', [CelularVentaController::class, 'store']);
    Route::get('/celulares/ventas/{venta}', [CelularVentaController::class, 'show']);
    Route::get('/celulares/resumen', [CelularVentaController::class, 'resumen']);
    Route::get('/celulares/estado-cuenta', [CelularVentaController::class, 'estadoCuenta']);
    Route::patch('/cuotas/{cuota}/pagar', [CelularVentaController::class, 'marcarCuotaPagada']);
});