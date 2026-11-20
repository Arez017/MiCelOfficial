<?php

use Illuminate\Support\Facades\Route;

// Se entrega el panel directamente (sin redirect): un redirect arma la URL con el
// host interno (micel.test) y rompe el acceso desde un túnel o un dominio externo.
Route::get('/', function () {
    return response()->file(public_path('index.html'));
});