<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => [
        'http://localhost',
        'http://127.0.0.1',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'https://arez017.github.io',
        // agrega el origen de tu frontend
    ],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => false,
];