<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    // Notificaciones push de la app MiCel (Firebase Cloud Messaging, API HTTP v1).
    // FCM_CREDENTIALS: ruta del JSON de la cuenta de servicio (fuera del repositorio).
    'fcm' => [
        'credentials' => env('FCM_CREDENTIALS'),
        'project_id' => env('FCM_PROJECT_ID'),
        'canal' => env('FCM_CANAL', 'micel_ordenes'),
        'timeout' => (int) env('FCM_TIMEOUT', 8),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
