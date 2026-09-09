<?php
/**
 * Proxy API iscrizione dual: Next/Supabase poi GAS (generato da deploy-iscrizione.js)
 * Backend: dual (ISCRIZIONE_BACKEND=dual)
 * VAI: settare ISCRIZIONE_BACKEND=dual e ISCRIZIONE_SUPABASE_API_URL
 * (es. https://<vercel>/api/iscrizione). Default produzione resta gas.
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
$API_BASE = rtrim('https://school.musicproeventi.it/api/iscrizione', '/');

function forward_request($url, $method, $body, $contentType) {
    if (!function_exists('curl_init')) {
        http_response_code(500);
        echo json_encode(array('success' => false, 'message' => 'cURL non disponibile sul server'));
        exit;
    }
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array($contentType));
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
    // Propaga JSON upstream (anche 4xx) così il form vede il messaggio reale.
    $decoded = json_decode($resp, true);
    if (is_array($decoded)) {
        http_response_code(($code >= 100 && $code < 600) ? $code : 200);
        echo $resp;
        exit;
    }
    if ($code >= 400) {
        http_response_code(502);
        echo json_encode(array('success' => false, 'message' => 'Upstream HTTP ' . $code, 'body' => substr($resp, 0, 500)));
        exit;
    }
    echo $resp;
    exit;
}

function gas_request($url, $method, $body) {
    forward_request($url, $method, $body, 'Content-Type: text/plain;charset=utf-8');
}

function supabase_request($url, $method, $body) {
    forward_request($url, $method, $body, 'Content-Type: application/json');
}

function supabase_try_get($op, $id, $token) {
    global $API_BASE;
    if (!function_exists('curl_init') || $API_BASE === '') {
        return null;
    }
    $qs = http_build_query(array(
        'op' => $op,
        'idIscrizione' => $id,
        'token' => $token,
    ));
    $ch = curl_init($API_BASE . '?' . $qs);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resp === false || $code >= 400) {
        return null;
    }
    $data = json_decode($resp, true);
    if (!is_array($data) || !isset($data['found']) || $data['found'] !== true) {
        return null;
    }
    return $resp;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $op = isset($_GET['op']) ? $_GET['op'] : '';
    $id = isset($_GET['idIscrizione']) ? $_GET['idIscrizione'] : '';
    $token = isset($_GET['token']) ? $_GET['token'] : '';
    $supabaseOps = array('validateIscrizioneToken', 'getStatoIscrizione', 'sincronizzaPagamento');
    if (in_array($op, $supabaseOps, true)) {
        $sb = supabase_try_get($op, $id, $token);
        if ($sb !== null) {
            echo $sb;
            exit;
        }
    }
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
    $payload = json_decode($body, true);
    $token = '';
    $action = '';
    if (is_array($payload)) {
        $action = isset($payload['action']) ? trim((string) $payload['action']) : '';
        if (!empty($payload['iscrizioneToken'])) {
            $token = trim((string) $payload['iscrizioneToken']);
        } elseif (!empty($payload['token'])) {
            $token = trim((string) $payload['token']);
        }
    }
    // Flussi con magic link / contanti: sempre Next (mai fallback GAS → hang).
    $supabasePostActions = array(
        'salvaAggiornamentoAssociatoIscrizione',
        'inviaIscrizioneConPagamento',
        'inviaIscrizione',
        'richiediLinkIscrizioneAssociato',
    );
    if ($token !== '' && in_array($action, $supabasePostActions, true)) {
        supabase_request($API_BASE, 'POST', $body);
    }
    if ($token !== '') {
        $sb = supabase_try_get('validateIscrizioneToken', '', $token);
        if ($sb !== null) {
            supabase_request($API_BASE, 'POST', $body);
        }
        if (in_array($action, $supabasePostActions, true)) {
            http_response_code(400);
            echo json_encode(array(
                'success' => false,
                'message' => 'Link non valido, scaduto o già utilizzato. Richiedi un nuovo link allo sportello.',
            ));
            exit;
        }
    }
    gas_request($GAS_URL, 'POST', $body);
}

http_response_code(405);
echo json_encode(array('success' => false, 'message' => 'Metodo non consentito'));
