<?php

return [

    /*
    |--------------------------------------------------------------------------
    | CuotaLock v3
    |--------------------------------------------------------------------------
    | Ya no hay una clave global: cada celular genera su propia clave de
    | vinculación y se guarda cifrada (con APP_KEY) en la tabla dispositivos.
    | OJO: si cambias APP_KEY, esas claves no se podrán leer y habrá que volver
    | a cargar la clave de cada equipo. CUOTALOCK_SECRET ya no se usa.
    */

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
