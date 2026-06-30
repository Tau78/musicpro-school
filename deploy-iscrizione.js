#!/usr/bin/env node
/**
 * Carica iscrizione.html + api.php su iscrizione.musicproeventi.it
 * Il form resta sul sottodominio; api.php inoltra le richieste a GAS.
 * Uso: npm run deploy:iscrizione
 */

const fs = require("fs");
const path = require("path");
const ftp = require("basic-ftp");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const ISCRIZIONE_BACKEND = (
  process.env.ISCRIZIONE_BACKEND || "gas"
).trim().toLowerCase();

const GAS_URL = (
  process.env.GAS_ISCRIZIONE_URL ||
  "https://script.google.com/a/macros/www.musicproeventi.it/s/AKfycbyJAM4hGYz_k9_rDFIEJDevdcYxIRrsi4VbZdYJ9Rk9VFUYkpHYMfAPHx1_g8DEL8oZOA/exec"
).trim();

const SUPABASE_API_URL = (
  process.env.ISCRIZIONE_SUPABASE_API_URL || ""
).trim();

const FTP_HOST = (process.env.FTP_HOST_ISCRIZIONE || "iscrizione.musicproeventi.it").trim();
const FTP_USER = (process.env.ISCRIZIONE_FTP_USER || "").trim();
const FTP_PASS = (process.env.FTP_PASS_ISCRIZIONE || "").trim();
const REMOTE_PATH = (process.env.ISCRIZIONE_FTP_REMOTE_PATH || "/").trim() || "/";
const ISCRIZIONE_SITE_VERSION = (process.env.ISCRIZIONE_SITE_VERSION || "1.2.0").trim();

function injectBuildInfo(html) {
  const date = new Date().toISOString().slice(0, 10);
  return String(html)
    .replace(/__ISCRIZIONE_VERSION__/g, ISCRIZIONE_SITE_VERSION)
    .replace(/__ISCRIZIONE_DATE__/g, date);
}

function buildApiPhpGas(gasExecUrl) {
  const safe = gasExecUrl.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `<?php
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

$GAS_URL = '${safe}';

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
`;
}

function buildApiPhpSupabase(apiBaseUrl) {
  const safe = apiBaseUrl.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `<?php
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

$API_BASE = rtrim('${safe}', '/');

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
`;
}

function buildApiPhp(gasExecUrl, supabaseApiUrl) {
  if (ISCRIZIONE_BACKEND === "supabase") {
    if (!supabaseApiUrl) {
      throw new Error(
        "ISCRIZIONE_BACKEND=supabase richiede ISCRIZIONE_SUPABASE_API_URL (es. https://app.example.com/api/iscrizione)",
      );
    }
    return buildApiPhpSupabase(supabaseApiUrl);
  }
  return buildApiPhpGas(gasExecUrl);
}

const LOGO_SRC = path.join(__dirname, "assets", "music-pro-logo.png");

async function main() {
  if (!FTP_USER || !FTP_PASS) {
    console.error("Mancano ISCRIZIONE_FTP_USER o FTP_PASS_ISCRIZIONE in .env");
    process.exit(1);
  }

  const iscrizioneSrc = path.join(__dirname, "iscrizione.html");
  const firmaSrc = path.join(__dirname, "firma.html");
  if (!fs.existsSync(iscrizioneSrc)) {
    console.error("File mancante: iscrizione.html");
    process.exit(1);
  }
  if (!fs.existsSync(firmaSrc)) {
    console.error("File mancante: firma.html");
    process.exit(1);
  }

  const localDir = path.join(__dirname, ".deploy-iscrizione");
  fs.mkdirSync(localDir, { recursive: true });

  const indexPath = path.join(localDir, "index.html");
  const iscrizionePath = path.join(localDir, "iscrizione.html");
  const firmaPath = path.join(localDir, "firma.html");
  const apiPath = path.join(localDir, "api.php");

  const htmlBuilt = injectBuildInfo(fs.readFileSync(iscrizioneSrc, "utf8"));
  fs.writeFileSync(indexPath, htmlBuilt, "utf8");
  fs.writeFileSync(iscrizionePath, htmlBuilt, "utf8");
  fs.writeFileSync(firmaPath, fs.readFileSync(firmaSrc, "utf8"), "utf8");
  fs.writeFileSync(apiPath, buildApiPhp(GAS_URL, SUPABASE_API_URL), "utf8");

  const logoPath = path.join(localDir, "assets", "music-pro-logo.png");
  if (fs.existsSync(LOGO_SRC)) {
    fs.mkdirSync(path.join(localDir, "assets"), { recursive: true });
    fs.copyFileSync(LOGO_SRC, logoPath);
  }

  const client = new ftp.Client(30000);
  client.ftp.verbose = false;

  try {
    console.log("Connessione FTP a " + FTP_HOST + " come " + FTP_USER + "...");
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false,
    });

    const remoteDir = REMOTE_PATH.replace(/\/$/, "") || "/";
    await client.ensureDir(remoteDir);
    await client.cd(remoteDir);

    await client.uploadFrom(indexPath, "index.html");
    console.log("Caricato: " + remoteDir + "/index.html");

    await client.uploadFrom(iscrizionePath, "iscrizione.html");
    console.log("Caricato: " + remoteDir + "/iscrizione.html");

    await client.uploadFrom(firmaPath, "firma.html");
    console.log("Caricato: " + remoteDir + "/firma.html");

    await client.uploadFrom(apiPath, "api.php");
    console.log("Caricato: " + remoteDir + "/api.php");

    if (fs.existsSync(logoPath)) {
      await client.ensureDir(remoteDir + "/assets");
      await client.cd(remoteDir + "/assets");
      await client.uploadFrom(logoPath, "music-pro-logo.png");
      console.log("Caricato: " + remoteDir + "/assets/music-pro-logo.png");
      await client.cd(remoteDir);
    }

    console.log("Deploy completato. Form statico su https://iscrizione.musicproeventi.it/");
    console.log("Firma documento: https://iscrizione.musicproeventi.it/firma.html");
    console.log("Build: v" + ISCRIZIONE_SITE_VERSION + " · " + new Date().toISOString().slice(0, 10));
    if (ISCRIZIONE_BACKEND === "supabase") {
      console.log("API proxy → Supabase backend " + SUPABASE_API_URL);
    } else {
      console.log("API proxy → GAS " + GAS_URL);
    }
  } catch (err) {
    console.error("Errore deploy:", err.message || err);
    process.exit(1);
  } finally {
    client.close();
  }
}

main();
