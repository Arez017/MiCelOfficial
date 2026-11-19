<?php

test('the application returns a successful response', function () {
    $response = $this->get('/');

    // Acepta 200 (OK) o 302 (redirect al login / front)
    expect($response->getStatusCode())->toBeIn([200, 302]);
});