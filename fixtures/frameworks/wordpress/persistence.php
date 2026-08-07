<?php

header('Content-Type: application/json');

$expectedToken = (string) getenv('FRAMEWORK_ACCEPTANCE_TOKEN');
$providedToken = (string) ($_SERVER['HTTP_X_FRAMEWORK_ACCEPTANCE_TOKEN'] ?? '');
if ($expectedToken === '' || !hash_equals($expectedToken, $providedToken)) {
	http_response_code(404);
	exit;
}

$directory = __DIR__ . '/wp-content';
$path = $directory . '/acceptance-marker.txt';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
	$input = json_decode((string) file_get_contents('php://input'), true);
	$marker = is_array($input) ? ($input['marker'] ?? null) : null;
	if (!is_string($marker) || $marker === '' || strlen($marker) > 256) {
		http_response_code(422);
		exit;
	}
	if (!is_dir($directory)) mkdir($directory, 0775, true);
	file_put_contents($path, $marker, LOCK_EX);
}
if (!is_file($path)) {
	http_response_code(404);
	exit;
}

echo json_encode(['checksum' => hash_file('sha256', $path)], JSON_THROW_ON_ERROR);
