<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Borra los mensajes viejos del chatbot (config/chatbot.php → memoria.retener_dias)
Schedule::command('model:prune', ['--model' => [App\Models\ChatbotMensaje::class]])->daily();
