<?php

require __DIR__ . '/vendor/autoload.php';

use Ramsey\Uuid\Uuid;

function handle($event, $context)
{
    $headers = json_decode('
    {
        "Content-Type": ["text/plain"]
    }
    ');

    $uuid = Uuid::uuid4();

    printf(
        "UUID: %s\nVersion: %d\n",
        $uuid->toString(),
        $uuid->getFields()->getVersion()
    );

    return [
        "body" => phpversion(),
        "statusCode" => 200,
        "headers" => $headers,
    ];
}
