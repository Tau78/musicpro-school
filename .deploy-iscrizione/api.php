<?php
/**
 * Proxy API iscrizione → Next.js Supabase backend (generato da deploy-iscrizione.js)
 * Backend: supabase (ISCRIZIONE_BACKEND=supabase)
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$API_BASE = rtrim('https://school.musicproeventi.it/api/iscrizione', '/');

function proxy_request($url, $method, $body) {
    if (!function_exists('curl_init')) {
        http_response_code(500);
        echo json_encode(array('success' => false, 'message' => 'cURL non disponibile sul server'));
        exit;
    }
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 120);
    $headers = array('Content-Type: application/json');
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($resp === false) {
        http_response_code(502);
        echo json_encode(array('success' => false, 'message' => 'Errore proxy: ' . $err));
        exit;
    }
    if ($code >= 400) {
        http_response_code(502);
        echo json_encode(array('success' => false, 'message' => 'API HTTP ' . $code, 'body' => substr($resp, 0, 500)));
        exit;
    }
    echo $resp;
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $op = isset($_GET['op']) ? $_GET['op'] : '';
    $id = isset($_GET['idIscrizione']) ? $_GET['idIscrizione'] : '';
    $token = isset($_GET['token']) ? $_GET['token'] : '';
    $qs = http_build_query(array(
        'op' => $op,
        'idIscrizione' => $id,
        'token' => $token,
    ));
    proxy_request($API_BASE . '?' . $qs, 'GET', '');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = file_get_contents('php://input');
    if (!$body) {
        http_response_code(400);
        echo json_encode(array('success' => false, 'message' => 'Body vuoto'));
        exit;
    }
    proxy_request($API_BASE, 'POST', $body);
}

http_response_code(405);
echo json_encode(array('success' => false, 'message' => 'Metodo non consentito'));
