<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\DB;

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
