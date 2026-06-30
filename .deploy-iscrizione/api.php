<?php
/**
 * Proxy API iscrizione → Google Apps Script (generato da deploy-iscrizione.js)
 * Backend: gas (ISCRIZIONE_BACKEND=gas)
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$GAS_URL = 'https://script.google.com/a/macros/www.musicproeventi.it/s/AKfycbyJAM4hGYz_k9_rDFIEJDevdcYxIRrsi4VbZdYJ9Rk9VFUYkpHYMfAPHx1_g8DEL8oZOA/exec';

function gas_request($url, $method, $body) {
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
    curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: text/plain;charset=utf-8'));
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
        echo json_encode(array('success' => false, 'message' => 'GAS HTTP ' . $code, 'body' => substr($resp, 0, 500)));
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
        'action' => 'api',
        'op' => $op,
        'idIscrizione' => $id,
        'token' => $token,
    ));
    gas_request($GAS_URL . '?' . $qs, 'GET', '');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = file_get_contents('php://input');
    if (!$body) {
        http_response_code(400);
        echo json_encode(array('success' => false, 'message' => 'Body vuoto'));
        exit;
    }
    gas_request($GAS_URL, 'POST', $body);
}

http_response_code(405);
echo json_encode(array('success' => false, 'message' => 'Metodo non consentito'));
