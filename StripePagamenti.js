/**
 * Stripe — quota associativa (Payment Link + webhook).
 * Pattern allineato a MusicPro Eventi (preadesione).
 *
 * Script Properties richieste:
 *   STRIPE_MODE (test|live) — seleziona quale chiave usare
 *   STRIPE_SECRET_KEY_TEST + STRIPE_SECRET_KEY_LIVE (consigliato)
 *   oppure legacy STRIPE_SECRET_KEY / STRIPE_SECRET_KEY_PREADESIONE (una sola)
 *   STRIPE_WEBHOOK_TOKEN, STRIPE_RETURN_URL, STRIPE_CURRENCY (eur)
 *
 * Webhook Stripe Dashboard:
 *   POST https://script.google.com/macros/s/DEPLOYMENT_ID/exec?action=stripeWebhookPagamento&token=TOKEN
 * Eventi: checkout.session.completed, checkout.session.async_payment_succeeded, payment_intent.succeeded
 */

var QUOTA_ASSOCIATIVA_CENTESIMI = 1500;

function _stripeNormalizeMode_(raw) {
  var m = String(raw || 'test').toLowerCase().trim();
  return m === 'live' ? 'live' : 'test';
}

function _stripeKeyPrefix_(secret) {
  var s = String(secret || '').trim();
  if (s.indexOf('sk_live_') === 0) return 'live';
  if (s.indexOf('sk_test_') === 0) return 'test';
  return '';
}

/**
 * Legge STRIPE_MODE e restituisce la chiave segreta coerente (test vs live).
 * @throws {Error} se la chiave manca o non corrisponde a STRIPE_MODE
 */
function _stripeResolveSecretKey_(p, mode) {
  var testKey = String(
    p.getProperty('STRIPE_SECRET_KEY_TEST') ||
    p.getProperty('STRIPE_SECRET_KEY_PREADESIONE_TEST') ||
    ''
  ).trim();
  var liveKey = String(
    p.getProperty('STRIPE_SECRET_KEY_LIVE') ||
    p.getProperty('STRIPE_SECRET_KEY_PREADESIONE_LIVE') ||
    ''
  ).trim();
  var legacyKey = String(
    p.getProperty('STRIPE_SECRET_KEY') ||
    p.getProperty('STRIPE_SECRET_KEY_PREADESIONE') ||
    ''
  ).trim();

  var secret = mode === 'live' ? liveKey : testKey;
  var source = mode === 'live' ? 'STRIPE_SECRET_KEY_LIVE' : 'STRIPE_SECRET_KEY_TEST';

  if (!secret && legacyKey) {
    secret = legacyKey;
    source = 'STRIPE_SECRET_KEY (legacy)';
  }

  if (!secret) {
    throw new Error(
      'Config mancante: imposta ' + (mode === 'live' ? 'STRIPE_SECRET_KEY_LIVE' : 'STRIPE_SECRET_KEY_TEST') +
      ' nelle Proprietà script (STRIPE_MODE=' + mode + ').'
    );
  }

  if (secret.indexOf('rk_') === 0) {
    throw new Error(
      'Chiave Stripe non valida: usa la Secret key (sk_' + mode + '_...), non la Restricted key (rk_...). ' +
      'Stripe Dashboard → Developers → API keys → Secret key.'
    );
  }

  var keyMode = _stripeKeyPrefix_(secret);
  if (keyMode && keyMode !== mode) {
    throw new Error(
      'Chiave Stripe non coerente con STRIPE_MODE=' + mode + ': la chiave da ' + source +
      ' è sk_' + keyMode + '_. Usa sk_' + mode + '_ oppure cambia STRIPE_MODE.'
    );
  }

  return secret;
}

function _stripeProps_() {
  var p = PropertiesService.getScriptProperties();
  var mode = _stripeNormalizeMode_(p.getProperty('STRIPE_MODE'));
  var secret = _stripeResolveSecretKey_(p, mode);
  return {
    secret: secret,
    webhookToken: String(p.getProperty('STRIPE_WEBHOOK_TOKEN') || '').trim(),
    returnBase: String(p.getProperty('STRIPE_RETURN_URL') || '').trim(),
    currency: String(p.getProperty('STRIPE_CURRENCY') || 'eur').toLowerCase(),
    mode: mode
  };
}

function createStripeWebhookAckOutput(obj) {
  var body = 'ok';
  try {
    body = JSON.stringify(obj != null ? obj : { received: true, ok: true });
  } catch (eSer) {
    body = '{"received":true,"ok":true}';
  }
  return HtmlService.createHtmlOutput(body)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function _stripeWebhookEventAlreadySeen_(evtId) {
  if (!evtId || String(evtId).indexOf('evt_') !== 0) return false;
  try {
    return !!CacheService.getScriptCache().get('stripe_wh_evt_' + String(evtId));
  } catch (eSe) {
    return false;
  }
}

function _stripeWebhookMarkEventProcessed_(evtId) {
  if (!evtId || String(evtId).indexOf('evt_') !== 0) return;
  try {
    CacheService.getScriptCache().put('stripe_wh_evt_' + String(evtId), '1', 21600);
  } catch (eMk) {}
}

function _stripeWebhookFinalizeResult_(evtId, result) {
  if (result && result.ok !== false) {
    _stripeWebhookMarkEventProcessed_(evtId);
  }
  return result;
}

function _isStaticIscrizioneSiteUrl(url) {
  return /iscrizione\.musicproeventi\.it/i.test(String(url || ''));
}

/** Forza STRIPE_RETURN_URL verso pagina iscrizione statica o GAS (?page=iscrizione). */
function _normalizeIscrizioneReturnBase(baseUrl) {
  var u = String(baseUrl || '').trim();
  if (!u) return '';
  u = u.replace(/[?&]page=conferma-pagamento/gi, '');
  u = u.replace(/page=conferma-pagamento&?/gi, '');
  u = u.replace(/\?&/, '?').replace(/&&/g, '&').replace(/[?&]$/, '');
  if (_isStaticIscrizioneSiteUrl(u)) {
    u = u.replace(/[?&]page=iscrizione/gi, '').replace(/\?&/, '?').replace(/[?&]$/, '');
    return u;
  }
  if (u.indexOf('page=iscrizione') < 0) {
    u = u + (u.indexOf('?') >= 0 ? '&' : '?') + 'page=iscrizione';
  }
  return u;
}

/** URL di ritorno post-checkout: pagina iscrizione GAS (?page=iscrizione). */
function getDefaultIscrizioneReturnUrl() {
  try {
    var url = ScriptApp.getService().getUrl();
    if (url && url.indexOf('http') === 0) {
      return _normalizeIscrizioneReturnBase(url);
    }
  } catch (e) {}
  return '';
}

function _buildQuotaAssociativaReturnUrl(baseUrl, payload) {
  var safeBase = _normalizeIscrizioneReturnBase(String(baseUrl || '').trim());
  if (!safeBase) safeBase = getDefaultIscrizioneReturnUrl();
  if (!safeBase) return '';
  var sep = safeBase.indexOf('?') >= 0 && safeBase.indexOf('=') >= 0 ? '&' : '?';
  if (safeBase.indexOf('idIscrizione=') >= 0) sep = '&';
  var q = [];
  q.push('idIscrizione=' + encodeURIComponent(String(payload.idIscrizione || '')));
  q.push('nome=' + encodeURIComponent(String(payload.nome || '')));
  q.push('cognome=' + encodeURIComponent(String(payload.cognome || '')));
  q.push('importo=' + encodeURIComponent(String(payload.importo || '')));
  q.push('dopoPagamento=1');
  return safeBase + sep + q.join('&');
}

function _stripeDeactivatePaymentLinkById(stripeSecret, paymentLinkId) {
  var sec = String(stripeSecret || '').trim();
  var plId = String(paymentLinkId || '').trim();
  if (!sec || !plId || plId.indexOf('pl_') !== 0) return;
  try {
    var r = UrlFetchApp.fetch('https://api.stripe.com/v1/payment_links/' + encodeURIComponent(plId), {
      method: 'post',
      headers: { Authorization: 'Bearer ' + sec },
      payload: { active: 'false' },
      muteHttpExceptions: true
    });
    var code = r.getResponseCode();
    if (code < 200 || code >= 300) {
      Logger.log('[stripeDeactivatePL] HTTP ' + code + ' pl=' + plId);
    }
  } catch (ePl) {
    Logger.log('[stripeDeactivatePL] ' + (ePl.message || ePl));
  }
}

function _stripeResolvePaymentLinkIdFromPaymentIntent(stripeSecret, piId) {
  var sec = String(stripeSecret || '').trim();
  var pi = String(piId || '').trim();
  if (!sec || !pi || pi.indexOf('pi_') !== 0) return '';
  try {
    var r = UrlFetchApp.fetch(
      'https://api.stripe.com/v1/checkout/sessions?payment_intent=' + encodeURIComponent(pi) + '&limit=1',
      { method: 'get', headers: { Authorization: 'Bearer ' + sec }, muteHttpExceptions: true }
    );
    if (r.getResponseCode() < 200 || r.getResponseCode() >= 300) return '';
    var body = JSON.parse(r.getContentText() || '{}');
    var arr = body && body.data ? body.data : [];
    if (!arr.length) return '';
    var pl = arr[0].payment_link;
    return typeof pl === 'string' ? pl : (pl && pl.id ? String(pl.id) : '');
  } catch (eS) {
    Logger.log('[stripeResolvePLfromPI] ' + (eS.message || eS));
    return '';
  }
}

function _stripeFetchPaymentFinancials(stripeSecret, eventType, obj, piIdHint) {
  var out = { lordoCents: null, feeCents: null, netCents: null, piId: String(piIdHint || '').trim() };
  var objLocal = obj || {};
  var et = String(eventType || '');

  if (et.indexOf('checkout.session') === 0) {
    var at = parseInt(String(objLocal.amount_total != null ? objLocal.amount_total : ''), 10);
    if (isFinite(at) && at > 0) out.lordoCents = at;
    if (!out.piId && objLocal.payment_intent) {
      out.piId = typeof objLocal.payment_intent === 'string' ? objLocal.payment_intent : (objLocal.payment_intent && objLocal.payment_intent.id ? String(objLocal.payment_intent.id) : '');
    }
  }
  if (et.indexOf('payment_intent') === 0 && objLocal.id) {
    out.piId = String(objLocal.id);
    var ar = parseInt(String(objLocal.amount_received != null ? objLocal.amount_received : objLocal.amount || ''), 10);
    if (isFinite(ar) && ar > 0) out.lordoCents = ar;
  }

  if (!out.piId || !stripeSecret) return out;

  try {
    var urlPi = 'https://api.stripe.com/v1/payment_intents/' + encodeURIComponent(out.piId) + '?expand[]=latest_charge.balance_transaction';
    var rPi = UrlFetchApp.fetch(urlPi, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + stripeSecret },
      muteHttpExceptions: true
    });
    if (rPi.getResponseCode() >= 200 && rPi.getResponseCode() < 300) {
      var piBody = JSON.parse(rPi.getContentText() || '{}');
      if (!out.lordoCents) {
        var ar2 = parseInt(String(piBody.amount_received != null ? piBody.amount_received : piBody.amount || ''), 10);
        if (isFinite(ar2) && ar2 > 0) out.lordoCents = ar2;
      }
      var ch = piBody.latest_charge;
      if (ch && typeof ch === 'object') {
        var bt = ch.balance_transaction;
        if (bt && typeof bt === 'object') {
          var bcLordo = parseInt(String(bt.amount != null ? bt.amount : ''), 10);
          var bcFee = parseInt(String(bt.fee != null ? bt.fee : ''), 10);
          var bcNet = parseInt(String(bt.net != null ? bt.net : ''), 10);
          if (isFinite(bcLordo) && bcLordo > 0) out.lordoCents = bcLordo;
          if (isFinite(bcFee) && bcFee >= 0) out.feeCents = bcFee;
          if (isFinite(bcNet)) out.netCents = bcNet;
        }
      }
    }
  } catch (eFin) {
    Logger.log('[_stripeFetchPaymentFinancials] ' + (eFin.message || eFin));
  }
  return out;
}

/**
 * Crea Payment Link Stripe per quota associativa (importo fisso, qty 1).
 * @returns {{ success: boolean, url?: string, stripeId?: string, totaleCents?: number, message?: string }}
 */
function createStripePaymentLinkQuotaAssociativa(opts) {
  var cfg = _stripeProps_();
  if (!cfg.secret) throw new Error('Config mancante: STRIPE_SECRET_KEY');
  var returnBase = cfg.returnBase || getDefaultIscrizioneReturnUrl();
  if (!returnBase) throw new Error('Config mancante: STRIPE_RETURN_URL (URL pagina iscrizione)');

  var idIscrizione = String(opts.idIscrizione || '').trim();
  if (!idIscrizione) throw new Error('ID iscrizione mancante.');

  var importoCents = opts.importoCentesimi != null
    ? parseInt(String(opts.importoCentesimi), 10)
    : QUOTA_ASSOCIATIVA_CENTESIMI;
  if (!isFinite(importoCents) || importoCents < 50) {
    throw new Error('Importo quota non valido.');
  }

  var anno = opts.annoSocietario != null ? parseInt(String(opts.annoSocietario), 10) : new Date().getFullYear();
  var nome = String(opts.nome || '').trim();
  var cognome = String(opts.cognome || '').trim();
  var importoDisplay = (importoCents / 100).toFixed(2);

  var returnUrl = _buildQuotaAssociativaReturnUrl(returnBase, {
    idIscrizione: idIscrizione,
    nome: nome,
    cognome: cognome,
    importo: importoDisplay
  });

  var payload = {
    'line_items[0][price_data][currency]': cfg.currency,
    'line_items[0][price_data][unit_amount]': String(importoCents),
    'line_items[0][price_data][product_data][name]': 'Quota associativa ' + anno,
    'line_items[0][quantity]': '1',
    'after_completion[type]': 'redirect',
    'after_completion[redirect][url]': returnUrl,
    'metadata[mp_flow]': 'quota_associativa',
    'metadata[mp_id_iscrizione]': idIscrizione,
    'payment_intent_data[metadata][mp_flow]': 'quota_associativa',
    'payment_intent_data[metadata][mp_id_iscrizione]': idIscrizione,
    'metadata[mp_nome]': nome,
    'metadata[mp_cognome]': cognome,
    'metadata[mp_totale]': importoDisplay,
    'metadata[mp_ambiente]': cfg.mode
  };

  var headersPl = { Authorization: 'Bearer ' + cfg.secret };
  if (opts.idempotencyKey) {
    var ik = String(opts.idempotencyKey).trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 240);
    if (ik) headersPl['Idempotency-Key'] = ik;
  }

  var resp = UrlFetchApp.fetch('https://api.stripe.com/v1/payment_links', {
    method: 'post',
    headers: headersPl,
    payload: payload,
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  var raw = resp.getContentText() || '';
  var data = {};
  try { data = JSON.parse(raw); } catch (e) {}

  if (code >= 200 && code < 300 && data && data.url) {
    return {
      success: true,
      url: String(data.url),
      stripeId: String(data.id || ''),
      totaleCents: importoCents
    };
  }
  var err = data && data.error ? data.error : null;
  var msg = err && err.message ? String(err.message) : ('Errore Stripe HTTP ' + code);
  return { success: false, message: msg };
}

function _ensureIscrizioneStripeDeferredTrigger() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === '_deferredIscrizioneStripeWork') return;
    }
    ScriptApp.newTrigger('_deferredIscrizioneStripeWork').timeBased().after(12 * 1000).create();
  } catch (eTr) {
    Logger.log('[_ensureIscrizioneStripeDeferredTrigger] ' + (eTr.message || eTr));
  }
}

function _enqueueIscrizioneStripeDeferredWork(item) {
  if (!item || !item.id) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var q = props.getProperty('STRIPE_ISCR_WEBHOOK_DEFERRED_QUEUE') || '[]';
    var arr = [];
    try { arr = JSON.parse(q); } catch (eQ) { arr = []; }
    arr.push({
      id: String(item.id || ''),
      pl: String(item.pl || ''),
      pi: String(item.pi || ''),
      t: Date.now(),
      emailRetry: !!item.emailRetry
    });
    if (arr.length > 30) arr = arr.slice(-30);
    props.setProperty('STRIPE_ISCR_WEBHOOK_DEFERRED_QUEUE', JSON.stringify(arr));
    _ensureIscrizioneStripeDeferredTrigger();
  } catch (eEn) {
    Logger.log('[_enqueueIscrizioneStripeDeferredWork] ' + (eEn.message || eEn));
  }
}

/** @private trigger — disattiva Payment Link (PDF/email solo su invio utente dalla pagina iscrizione) */
function _deferredIscrizioneStripeWork() {
  var props = PropertiesService.getScriptProperties();
  var q = props.getProperty('STRIPE_ISCR_WEBHOOK_DEFERRED_QUEUE') || '[]';
  props.deleteProperty('STRIPE_ISCR_WEBHOOK_DEFERRED_QUEUE');
  var arr = [];
  try { arr = JSON.parse(q); } catch (eP) { return; }
  if (!arr.length) return;

  var cfg = _stripeProps_();
  for (var i = 0; i < arr.length; i++) {
    var item = arr[i];
    if (!item || !item.id) continue;
    try {
      var plId = String(item.pl || '').trim();
      if (!plId && cfg.secret && item.pi) {
        plId = _stripeResolvePaymentLinkIdFromPaymentIntent(cfg.secret, item.pi);
      }
      if (cfg.secret && plId && plId.indexOf('pl_') === 0) {
        _stripeDeactivatePaymentLinkById(cfg.secret, plId);
      }
    } catch (itemErr) {
      Logger.log('[_deferredIscrizioneStripeWork] id=' + item.id + ' ' + (itemErr.message || itemErr));
    }
  }
}

/**
 * Webhook Stripe quota associativa.
 * POST /exec?action=stripeWebhookPagamento&token=...
 */
function gestioneStripeWebhookPagamento(e) {
  var evtId = '';
  try {
    var cfg = _stripeProps_();
    var token = String((e && e.parameter && e.parameter.token) ? e.parameter.token : '').trim();
    if (!cfg.webhookToken) {
      return { received: true, ok: false, message: 'Config mancante: STRIPE_WEBHOOK_TOKEN' };
    }
    if (!token || token !== cfg.webhookToken) {
      return { received: true, ok: false, message: 'Token webhook non valido.' };
    }

    var raw = (e && e.postData && e.postData.contents) ? String(e.postData.contents) : '';
    if (!raw) {
      return { received: true, ok: true, ignored: true, reason: 'empty_payload' };
    }

    var body;
    try {
      body = JSON.parse(raw);
    } catch (eJson) {
      return { received: true, ok: true, ignored: true, reason: 'invalid_json' };
    }

    evtId = String((body && body.id) || '').trim();
    if (_stripeWebhookEventAlreadySeen_(evtId)) {
      return { received: true, ok: true, duplicateEvent: true, eventId: evtId };
    }

    var eventType = String((body && body.type) || '').trim();
    var obj = (body && body.data && body.data.object) ? body.data.object : {};
    var metadata = (obj && obj.metadata && typeof obj.metadata === 'object') ? obj.metadata : {};

    var isPaidEvent = eventType === 'checkout.session.completed'
      || eventType === 'checkout.session.async_payment_succeeded'
      || eventType === 'payment_intent.succeeded';
    if (!isPaidEvent) {
      return _stripeWebhookFinalizeResult_(evtId, { received: true, ok: true, ignored: true, eventType: eventType || 'unknown' });
    }

    if (eventType === 'checkout.session.completed') {
      var payStCo = String((obj && obj.payment_status) || '').toLowerCase().trim();
      if (payStCo && payStCo !== 'paid') {
        return _stripeWebhookFinalizeResult_(evtId, { received: true, ok: true, ignored: true, reason: 'checkout_session_not_paid', eventType: eventType });
      }
    }
    if (eventType === 'checkout.session.async_payment_succeeded') {
      var payStAsync = String((obj && obj.payment_status) || '').toLowerCase().trim();
      if (payStAsync && payStAsync !== 'paid') {
        return _stripeWebhookFinalizeResult_(evtId, { received: true, ok: true, ignored: true, reason: 'checkout_async_not_paid', eventType: eventType });
      }
    }
    if (eventType === 'payment_intent.succeeded') {
      try {
        var arZero = parseInt(String(obj.amount_received != null ? obj.amount_received : ''), 10);
        var amTot = parseInt(String(obj.amount != null ? obj.amount : ''), 10);
        if (isFinite(arZero) && arZero === 0 && isFinite(amTot) && amTot > 0) {
          return _stripeWebhookFinalizeResult_(evtId, { received: true, ok: true, ignored: true, reason: 'payment_intent_zero_received', eventType: eventType });
        }
      } catch (ePiZ) {}
    }

    var idIscr = String(metadata.mp_id_iscrizione || '').trim();
    if (!idIscr && cfg.secret && eventType.indexOf('checkout.session') === 0 && obj && obj.payment_intent) {
      var piRef = obj.payment_intent;
      var piIdLookup = typeof piRef === 'string' ? piRef : (piRef && piRef.id ? String(piRef.id) : '');
      if (piIdLookup) {
        try {
          var rPi = UrlFetchApp.fetch('https://api.stripe.com/v1/payment_intents/' + encodeURIComponent(piIdLookup), {
            method: 'get',
            headers: { Authorization: 'Bearer ' + cfg.secret },
            muteHttpExceptions: true
          });
          if (rPi.getResponseCode() >= 200 && rPi.getResponseCode() < 300) {
            var piBody = JSON.parse(rPi.getContentText() || '{}');
            var pm = (piBody && piBody.metadata && typeof piBody.metadata === 'object') ? piBody.metadata : {};
            idIscr = String(pm.mp_id_iscrizione || '').trim();
          }
        } catch (piErr) {
          Logger.log('[gestioneStripeWebhookPagamento] retrieve PI: ' + (piErr.message || piErr));
        }
      }
    }

    if (!idIscr) {
      return _stripeWebhookFinalizeResult_(evtId, { received: true, ok: true, ignored: true, reason: 'no_iscrizione_id', eventType: eventType });
    }

    var piDedup = '';
    try {
      if (obj && obj.payment_intent) {
        piDedup = typeof obj.payment_intent === 'string' ? obj.payment_intent : (obj.payment_intent && obj.payment_intent.id ? String(obj.payment_intent.id) : '');
      }
      if (!piDedup && eventType.indexOf('payment_intent') === 0 && obj && obj.id) piDedup = String(obj.id);
    } catch (ePid) { piDedup = ''; }

    var finCache = CacheService.getScriptCache();
    if (piDedup && finCache.get('stripe_pi_fin_' + piDedup)) {
      var needsEmailDup = typeof iscrizioneNeedsPostPaymentEmail === 'function'
        ? iscrizioneNeedsPostPaymentEmail(idIscr)
        : false;
      if (needsEmailDup) {
        _enqueueIscrizioneStripeDeferredWork({ id: idIscr, pi: piDedup, emailRetry: true });
      }
      return _stripeWebhookFinalizeResult_(evtId, { received: true, ok: true, duplicate: true, idIscrizione: idIscr, paymentIntent: piDedup });
    }

    var finStripe = _stripeFetchPaymentFinancials(cfg.secret, eventType, obj, piDedup);
    if (!piDedup && finStripe.piId) piDedup = finStripe.piId;

    var updated = typeof aggiornaIscrizionePagamentoPagato === 'function'
      ? aggiornaIscrizionePagamentoPagato(idIscr, finStripe, piDedup || finStripe.piId)
      : 0;

    var needsPostEmail = typeof iscrizioneNeedsPostPaymentEmail === 'function'
      ? iscrizioneNeedsPostPaymentEmail(idIscr)
      : false;

    var plIdToDeactivate = '';
    if (eventType.indexOf('checkout.session') === 0 && obj) {
      var plRf = obj.payment_link;
      plIdToDeactivate = typeof plRf === 'string' ? plRf : (plRf && plRf.id ? String(plRf.id) : '');
    }

    if (!updated && !needsPostEmail) {
      if (piDedup) try { finCache.put('stripe_pi_fin_' + piDedup, '1', 21600); } catch (eFcDup) {}
      return _stripeWebhookFinalizeResult_(evtId, { received: true, ok: true, duplicate: true, idIscrizione: idIscr, eventType: eventType });
    }

    if (piDedup) try { finCache.put('stripe_pi_fin_' + piDedup, '1', 21600); } catch (eFcDone) {}

    _enqueueIscrizioneStripeDeferredWork({
      id: idIscr,
      pl: plIdToDeactivate,
      pi: piDedup || finStripe.piId,
      emailRetry: !updated && needsPostEmail
    });

    return _stripeWebhookFinalizeResult_(evtId, {
      received: true,
      ok: true,
      idIscrizione: idIscr,
      eventType: eventType,
      deferred: true,
      updated: updated > 0
    });
  } catch (e2) {
    Logger.log('[gestioneStripeWebhookPagamento] ' + (e2.message || e2));
    return _stripeWebhookFinalizeResult_(evtId, { received: true, ok: false, message: e2.message || 'Errore webhook Stripe.' });
  }
}

/**
 * Fallback se il webhook non arriva: interroga Stripe sul Payment Link e segna PAGATO.
 */
function sincronizzaPagamentoIscrizioneStripe(idIscrizione) {
  var id = String(idIscrizione || '').trim();
  if (!id) return { found: false, pagato: false };

  var rec = typeof getIscrizioneById === 'function' ? getIscrizioneById(id) : null;
  if (!rec) return { found: false, pagato: false };

  if (String(rec.pagamentoStato || '').toUpperCase().trim() === 'PAGATO') {
    return { found: true, pagato: true, already: true, idIscrizione: id };
  }

  var plId = String(rec.pagamentoLinkId || '').trim();
  if (!plId) {
    return { found: true, pagato: false, idIscrizione: id, message: 'Payment Link non trovato nel foglio.' };
  }

  var cfg = _stripeProps_();
  if (!cfg.secret) {
    return { found: true, pagato: false, idIscrizione: id, message: 'Chiave Stripe non configurata.' };
  }

  try {
    var url = 'https://api.stripe.com/v1/checkout/sessions?payment_link='
      + encodeURIComponent(plId) + '&limit=10';
    var resp = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + cfg.secret },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() < 200 || resp.getResponseCode() >= 300) {
      return {
        found: true,
        pagato: false,
        idIscrizione: id,
        message: 'Stripe HTTP ' + resp.getResponseCode()
      };
    }

    var body = JSON.parse(resp.getContentText() || '{}');
    var sessions = (body && body.data) ? body.data : [];
    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i] || {};
      var paySt = String(s.payment_status || '').toLowerCase().trim();
      if (paySt !== 'paid') continue;

      var meta = (s.metadata && typeof s.metadata === 'object') ? s.metadata : {};
      var metaId = String(meta.mp_id_iscrizione || '').trim();
      if (metaId && metaId !== id) continue;

      var piRef = s.payment_intent;
      var piId = typeof piRef === 'string' ? piRef : (piRef && piRef.id ? String(piRef.id) : '');
      var fin = _stripeFetchPaymentFinancials(cfg.secret, 'checkout.session.completed', s, piId);
      if (typeof aggiornaIscrizionePagamentoPagato === 'function') {
        aggiornaIscrizionePagamentoPagato(id, fin, piId || fin.piId);
      }
      return { found: true, pagato: true, synced: true, idIscrizione: id };
    }
  } catch (syncErr) {
    Logger.log('[sincronizzaPagamentoIscrizioneStripe] ' + (syncErr.message || syncErr));
    return { found: true, pagato: false, idIscrizione: id, message: syncErr.message || String(syncErr) };
  }

  return { found: true, pagato: false, idIscrizione: id };
}

/**
 * Controllo rapido prima del go-live (eseguire da editor GAS).
 */
function verificaConfigStripe() {
  var cfg = _stripeProps_();
  var sk = String(cfg.secret || '');
  var result = {
    mode: cfg.mode,
    keyType: sk.indexOf('sk_live_') === 0 ? 'live' : (sk.indexOf('sk_test_') === 0 ? 'test' : 'sconosciuta'),
    returnUrl: cfg.returnBase,
    webhookTokenImpostato: !!cfg.webhookToken,
    currency: cfg.currency,
    ok: false,
    messaggi: []
  };
  if (sk.indexOf('rk_') === 0) {
    result.messaggi.push('ERRORE: rk_ non va bene. Usa sk_live_ o sk_test_.');
  }
  if (result.keyType !== cfg.mode) {
    result.messaggi.push('ERRORE: STRIPE_MODE=' + cfg.mode + ' ma la chiave è ' + result.keyType + '.');
  }
  if (!cfg.returnBase) result.messaggi.push('ERRORE: STRIPE_RETURN_URL mancante.');
  if (!cfg.webhookToken) result.messaggi.push('ATTENZIONE: STRIPE_WEBHOOK_TOKEN mancante.');
  result.ok = result.messaggi.length === 0;
  if (result.ok) result.messaggi.push('Configurazione OK per modalità ' + cfg.mode + '.');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Test manuale da editor: crea record fittizio + Payment Link (non completa il pagamento).
 */
function testFlussoQuotaAssociativa() {
  var cfg = _stripeProps_();
  Logger.log('Stripe mode=' + cfg.mode + ' key=' + _stripeKeyPrefix_(cfg.secret) + ' (prefisso sk_' + cfg.mode + '_ richiesto)');
  if (!cfg.returnBase) throw new Error('Imposta STRIPE_RETURN_URL nelle Script Properties.');
  if (!cfg.webhookToken) Logger.log('ATTENZIONE: STRIPE_WEBHOOK_TOKEN non impostato — webhook non funzionerà.');

  ensureIscrizioniSheet();

  var testPayload = {
    nome: 'Test',
    cognome: 'Stripe',
    email: 'test@example.com',
    cf: 'TSTSRT80A01H501Z',
    telefono: '3330000000',
    metodo_pagamento: 'Stripe',
    signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  };

  var res = inviaIscrizioneConPagamento(testPayload);
  Logger.log('testFlussoQuotaAssociativa: ' + JSON.stringify(res));
  if (res && res.checkoutUrl) {
    Logger.log('Apri checkout: ' + res.checkoutUrl);
  }
  return res;
}
