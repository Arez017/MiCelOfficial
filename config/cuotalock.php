<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Clave secreta de CuotaLock
    |--------------------------------------------------------------------------
    | Debe ser IDÉNTICA a la que usa la app Android (se pasa a Policy(...)) y
    | herramientas/generar_codigo.py. Se define en el .env y NO se sube a GitHub.
    | En el .env ponla entre comillas dobles para que # o espacios no la corten:
    |   CUOTALOCK_SECRET="tu-clave-larga-y-aleatoria"
    */
    'secret' => env('CUOTALOCK_SECRET'),

    /*
    | Días de gracia que se suman a la fecha de la próxima cuota impaga
    | antes de que el celular se bloquee.
    */
    'dias_gracia' => (int) env('CUOTALOCK_DIAS_GRACIA', 3),

    /*
    | Zona horaria del negocio. Define cuándo cambia el "día" para vencimientos y
    | códigos. Debe coincidir con la que usa la app Android (America/La_Paz).
    */
    'zona_horaria' => env('CUOTALOCK_ZONA', 'America/La_Paz'),

];
