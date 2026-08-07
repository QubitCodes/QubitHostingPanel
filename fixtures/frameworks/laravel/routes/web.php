<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\Request;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/healthz', function () {
    DB::select('select 1');

    return response()->json([
        'database' => 'connected',
        'framework' => 'laravel',
        'status' => 'healthy',
    ]);
});

Route::match(['get', 'post'], '/persistence', function (Request $request) {
    $expectedToken = (string) env('FRAMEWORK_ACCEPTANCE_TOKEN', '');
    $providedToken = (string) $request->header('x-framework-acceptance-token', '');
    abort_unless($expectedToken !== '' && hash_equals($expectedToken, $providedToken), 404);

    $path = storage_path('app/public/acceptance-marker.txt');
    if ($request->isMethod('post')) {
        $marker = $request->string('marker')->toString();
        abort_unless($marker !== '' && strlen($marker) <= 256, 422);
        if (!is_dir(dirname($path))) mkdir(dirname($path), 0775, true);
        file_put_contents($path, $marker, LOCK_EX);
    }
    abort_unless(is_file($path), 404);

    return response()->json(['checksum' => hash_file('sha256', $path)]);
});
