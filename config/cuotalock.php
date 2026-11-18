<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Clave secreta de CuotaLock
    |--------------------------------------------------------------------------
    | Debe ser IDÉNTICA a SECRET en Policy.kt (app Android) y en
    | herramientas/generar_codigo.py. Se define en el .env y NO se sube a GitHub.
    */
    'secret' => env('CUOTALOCK_SECRET'),

    /*
    | Días de gracia que se suman a la fecha de la próxima cuota impaga
    | antes de que el celular se bloquee.
    */
    'dias_gracia' => (int) env('CUOTALOCK_DIAS_GRACIA', 3),

];
