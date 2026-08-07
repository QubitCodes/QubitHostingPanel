<?php

header('Content-Type: application/json');

$database = 'not-configured';
$hostValue = getenv('WORDPRESS_DB_HOST');
if ($hostValue) {
	$host = $hostValue;
	$port = 3306;
	if (str_contains($hostValue, ':')) {
		[$host, $portValue] = explode(':', $hostValue, 2);
		$port = (int) $portValue;
	}
	$connection = new mysqli(
		$host,
		(string) getenv('WORDPRESS_DB_USER'),
		(string) getenv('WORDPRESS_DB_PASSWORD'),
		(string) getenv('WORDPRESS_DB_NAME'),
		$port,
	);
	$connection->query('SELECT 1');
	$connection->close();
	$database = 'connected';
}

echo json_encode([
	'database' => $database,
	'framework' => 'wordpress',
	'status' => 'healthy',
], JSON_THROW_ON_ERROR);
