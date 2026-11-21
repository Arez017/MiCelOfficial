<?php

use App\Models\Cliente;
use App\Models\ServiceOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

const TOKEN_CELULAR = 'token-de-prueba-del-celular-0123456789';

/** Cuenta de servicio falsa con una clave RSA real, para firmar el JWT como lo haría Google. */
function configurarFirebaseDePrueba(): void
{
    $clave = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
    openssl_pkey_export($clave, $pem);
    $ruta = sys_get_temp_dir().'/micel-fcm-prueba-'.getmypid().'.json';
    file_put_contents($ruta, json_encode([
        'type' => 'service_account',
        'project_id' => 'micel-prueba',
        'client_email' => 'micel@micel-prueba.iam.gserviceaccount.com',
        'private_key' => $pem,
        'token_uri' => 'https://oauth2.googleapis.com/token',
    ]));
    config(['services.fcm.credentials' => $ruta, 'services.fcm.project_id' => null]);
    Cache::flush();
}

function respuestasDeGoogle(int $estadoFcm = 200, array $cuerpoFcm = ['name' => 'projects/micel-prueba/messages/1']): void
{
    Http::fake([
        'oauth2.googleapis.com/*' => Http::response(['access_token' => 'acceso-123', 'expires_in' => 3600]),
        'fcm.googleapis.com/*' => Http::response($cuerpoFcm, $estadoFcm),
    ]);
}

function clienteConApp(array $extra = []): Cliente
{
    return Cliente::forceCreate(array_merge([
        'code' => 'CLI-1', 'name' => 'Gabriel Mamani', 'phone' => '70000001',
        'username' => 'gabriel', 'password' => 'secreto123', 'fcm_token' => TOKEN_CELULAR,
    ], $extra));
}

function ordenDe(Cliente $cliente, string $estado = 'en_proceso'): ServiceOrder
{
    return ServiceOrder::create([
        'code' => 'OS-0101', 'client' => $cliente->name, 'phone' => $cliente->phone, 'cliente_id' => $cliente->id,
        'device' => 'Redmi Note 8', 'service' => 'Cambio de pantalla', 'status' => $estado, 'monto' => 250,
    ]);
}

function comoAdministrador(): User
{
    $user = User::factory()->create(['code' => 'U-N1', 'username' => 'admin_notif', 'rol' => 'administrador']);
    Sanctum::actingAs($user);

    return $user;
}

it('guarda el token del celular del cliente y no lo muestra en sus datos', function () {
    $cliente = clienteConApp(['fcm_token' => null]);
    Sanctum::actingAs($cliente);

    $this->postJson('/api/cliente/notificaciones/token', ['token' => TOKEN_CELULAR])->assertOk();

    expect($cliente->fresh()->fcm_token)->toBe(TOKEN_CELULAR);
    $this->getJson('/api/cliente/me')->assertOk()->assertJsonMissingPath('fcm_token');
});

it('un celular queda solo en la última cuenta que inició sesión en él', function () {
    $anterior = clienteConApp(['code' => 'CLI-9', 'username' => 'otro', 'phone' => '79999999']);
    $nuevo = clienteConApp(['code' => 'CLI-2', 'username' => 'nuevo', 'phone' => '70000002', 'fcm_token' => null]);
    Sanctum::actingAs($nuevo);

    $this->postJson('/api/cliente/notificaciones/token', ['token' => TOKEN_CELULAR])->assertOk();

    expect($anterior->fresh()->fcm_token)->toBeNull()
        ->and($nuevo->fresh()->fcm_token)->toBe(TOKEN_CELULAR);
});

it('el personal no puede registrar tokens de cliente', function () {
    comoAdministrador();
    $this->postJson('/api/cliente/notificaciones/token', ['token' => TOKEN_CELULAR])->assertForbidden();
});

it('al cerrar sesión el celular deja de recibir notificaciones', function () {
    $cliente = clienteConApp();
    $token = $cliente->createToken('app')->plainTextToken;

    $this->withToken($token)->postJson('/api/cliente/logout')->assertOk();

    expect($cliente->fresh()->fcm_token)->toBeNull();
});

it('avisa al cliente cuando su orden pasa a listo', function () {
    $this->withoutDefer();
    configurarFirebaseDePrueba();
    respuestasDeGoogle();
    $orden = ordenDe(clienteConApp());
    comoAdministrador();

    $this->patchJson("/api/orders/{$orden->id}/estado", ['status' => 'listo'])->assertOk();

    Http::assertSent(fn ($r) => str_contains($r->url(), 'fcm.googleapis.com/v1/projects/micel-prueba/messages:send')
        && $r->hasHeader('Authorization', 'Bearer acceso-123')
        && $r['message']['token'] === TOKEN_CELULAR
        && str_contains($r['message']['notification']['body'], 'Redmi Note 8')
        && $r['message']['data']['orden'] === 'OS-0101'
        && $r['message']['android']['notification']['channel_id'] === 'micel_ordenes');
});

it('también avisa cuando la orden queda lista al emitir el recibo', function () {
    $this->withoutDefer();
    configurarFirebaseDePrueba();
    respuestasDeGoogle();
    $orden = ordenDe(clienteConApp());
    comoAdministrador();

    $this->postJson('/api/recibos', [
        'orden_id' => $orden->id, 'cliente' => 'Gabriel Mamani', 'equipo' => 'Redmi Note 8',
        'servicio' => 'Cambio de pantalla', 'monto' => 250, 'pago' => 'efectivo',
    ])->assertCreated();

    expect($orden->fresh()->status)->toBe('listo');
    Http::assertSent(fn ($r) => str_contains($r->url(), 'messages:send'));
});

it('no avisa en los demás cambios de estado', function () {
    $this->withoutDefer();
    configurarFirebaseDePrueba();
    respuestasDeGoogle();
    $orden = ordenDe(clienteConApp(), 'recepcion');
    comoAdministrador();

    $this->patchJson("/api/orders/{$orden->id}/estado", ['status' => 'diagnostico'])->assertOk();

    Http::assertNothingSent();
});

it('sin Firebase configurado la orden cambia igual y no se envía nada', function () {
    $this->withoutDefer();
    config(['services.fcm.credentials' => null]);
    Http::fake();
    $orden = ordenDe(clienteConApp());
    comoAdministrador();

    $this->patchJson("/api/orders/{$orden->id}/estado", ['status' => 'listo'])->assertOk();

    expect($orden->fresh()->status)->toBe('listo');
    Http::assertNothingSent();
});

it('si Google dice que el celular ya no existe, se borra su token', function () {
    $this->withoutDefer();
    configurarFirebaseDePrueba();
    respuestasDeGoogle(404, ['error' => ['status' => 'NOT_FOUND', 'details' => [['errorCode' => 'UNREGISTERED']]]]);
    $cliente = clienteConApp();
    $orden = ordenDe($cliente);
    comoAdministrador();

    $this->patchJson("/api/orders/{$orden->id}/estado", ['status' => 'listo'])->assertOk();

    expect($cliente->fresh()->fcm_token)->toBeNull();
});

it('si Firebase falla, la orden se guarda igual', function () {
    $this->withoutDefer();
    configurarFirebaseDePrueba();
    respuestasDeGoogle(500, ['error' => ['status' => 'INTERNAL']]);
    $cliente = clienteConApp();
    $orden = ordenDe($cliente);
    comoAdministrador();

    $this->patchJson("/api/orders/{$orden->id}/estado", ['status' => 'listo'])->assertOk();

    expect($orden->fresh()->status)->toBe('listo')
        ->and($cliente->fresh()->fcm_token)->toBe(TOKEN_CELULAR);
});

it('firma el JWT para Google con RS256 y una firma verificable', function () {
    $this->withoutDefer();
    configurarFirebaseDePrueba();
    respuestasDeGoogle();
    $orden = ordenDe(clienteConApp());
    comoAdministrador();

    $this->patchJson("/api/orders/{$orden->id}/estado", ['status' => 'listo'])->assertOk();

    $cuenta = json_decode(file_get_contents(config('services.fcm.credentials')), true);
    $publica = openssl_pkey_get_details(openssl_pkey_get_private($cuenta['private_key']))['key'];
    $b64 = fn (string $t) => base64_decode(strtr($t, '-_', '+/'));

    Http::assertSent(function ($r) use ($publica, $b64, $cuenta) {
        if (! str_contains($r->url(), 'oauth2.googleapis.com')) {
            return false;
        }
        [$cab, $datos, $firma] = explode('.', $r['assertion']);
        $claims = json_decode($b64($datos), true);

        return $r['grant_type'] === 'urn:ietf:params:oauth:grant-type:jwt-bearer'
            && json_decode($b64($cab), true)['alg'] === 'RS256'
            && $claims['iss'] === $cuenta['client_email']
            && $claims['scope'] === 'https://www.googleapis.com/auth/firebase.messaging'
            && $claims['exp'] - $claims['iat'] === 3600
            && openssl_verify("{$cab}.{$datos}", $b64($firma), $publica, OPENSSL_ALGO_SHA256) === 1;
    });
});
