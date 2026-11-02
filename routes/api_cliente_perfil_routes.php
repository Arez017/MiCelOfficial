<?php
// Dentro del group auth:sanctum (o el de cliente), agrega:

use App\Http\Controllers\ClienteAuthController;

Route::prefix('cliente')->group(function () {
    Route::post('/login', [ClienteAuthController::class, 'login']); // público

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [ClienteAuthController::class, 'logout']);
        Route::get('/me', [ClienteAuthController::class, 'me']);
        Route::put('/perfil', [ClienteAuthController::class, 'updatePerfil']);
        Route::put('/password', [ClienteAuthController::class, 'changePassword']);
        Route::get('/mis-ordenes', [ClienteAuthController::class, 'misOrdenes']);
        Route::get('/cupones', [ClienteAuthController::class, 'cupones']);
    });
});
