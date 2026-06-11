/**
 * @version 4.0 - Iscrizioni con pagamento Stripe (Payment Link + webhook)
 */

const TEMPLATE_ISCRIZIONE_ID = "1CVxLAsEweuZD11N6V3CBkaNqegG6c2BeOT9WZLSw63I";
const FOLDER_ISCRIZIONI_ID = "1XCo-t2VwgOr6Pu7cWiiNcSxz4CXgPe6T";
const EMAIL_SEGRETERIA = "musicproeventi@gmail.com";
const ISCRIZIONI_SHEET_NAME = "ISCRIZIONI";
/** Stesso spreadsheet del foglio Associati (SPREADSHEET_ID in Codice.js). */
const SPREADSHEET_ISCRIZIONI_ID = (typeof SPREADSHEET_ID !== "undefined")
  ? SPREADSHEET_ID
  : "1vwyCTqXJDe0IKr_tIH2Dgz5ewlTo-OCnTxH2WNSYAOU";

var ISCR_COL = {
  ID: 0,
  NOME: 1,
  COGNOME: 2,
  EMAIL: 3,
  CF: 4,
  TELEFONO: 5,
  ANNO_SOCIETARIO: 6,
  IMPORTO_CENTESIMI: 7,
  PAGAMENTO_STATO: 8,
  PAGAMENTO_LINK_URL: 9,
  PAGAMENTO_LINK_ID: 10,
  PAGAMENTO_TOTALE_CENTESIMI: 11,
  PAGAMENTO_STRIPE_LORDO: 12,
  PAGAMENTO_STRIPE_FEE: 13,
  PAGAMENTO_STRIPE_NETTO: 14,
  PAGAMENTO_STRIPE_PI: 15,
  PAGAMENTO_PAGATO_AT: 16,
  CREATED_AT: 17,
  PAYLOAD_JSON: 18,
  PDF_URL: 19,
  EMAIL_CONFERMA_INVIATA: 20
};

var ISCRIZIONI_HEADERS = [
  "ID_Iscrizione", "Nome", "Cognome", "Email", "CF", "Telefono",
  "Anno_Societario", "Importo_Centesimi", "Pagamento_Stato",
  "Pagamento_Link_URL", "Pagamento_Link_ID", "Pagamento_Totale_Centesimi",
  "Pagamento_Stripe_Lordo_Centesimi", "Pagamento_Stripe_Commissione_Centesimi",
  "Pagamento_Stripe_Netto_Centesimi", "Pagamento_Stripe_Payment_Intent",
  "Pagamento_Pagato_At", "Created_At", "Payload_JSON", "PDF_URL", "Email_Conferma_Inviata"
];

function ensureIscrizioniSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ISCRIZIONI_ID);
  var sheet = ss.getSheetByName(ISCRIZIONI_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ISCRIZIONI_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, ISCRIZIONI_HEADERS.length).setValues([ISCRIZIONI_HEADERS]).setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else {
    var existing = sheet.getRange(1, 1, 1, ISCRIZIONI_HEADERS.length).getValues()[0];
    var needsHeader = false;
    for (var h = 0; h < ISCRIZIONI_HEADERS.length; h++) {
      if (String(existing[h] || "") !== ISCRIZIONI_HEADERS[h]) {
        needsHeader = true;
        break;
      }
    }
    if (needsHeader) {
      sheet.getRange(1, 1, 1, ISCRIZIONI_HEADERS.length).setValues([ISCRIZIONI_HEADERS]).setFontWeight("bold");
    }
  }
  return sheet;
}

function _getIscrizioniSheet() {
  return ensureIscrizioniSheet();
}

function _iscrizioneFindRowById(idIscrizione) {
  var sheet = _getIscrizioniSheet();
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, ISCR_COL.ID + 1, last - 1, 1).getValues();
  var target = String(idIscrizione || "").trim();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || "").trim() === target) return i + 2;
  }
  return -1;
}

function _iscrizioneRowToObject(row) {
  if (!row || !row.length) return null;
  return {
    id: String(row[ISCR_COL.ID] || ""),
    nome: String(row[ISCR_COL.NOME] || ""),
    cognome: String(row[ISCR_COL.COGNOME] || ""),
    email: String(row[ISCR_COL.EMAIL] || ""),
    cf: String(row[ISCR_COL.CF] || ""),
    telefono: String(row[ISCR_COL.TELEFONO] || ""),
    annoSocietario: row[ISCR_COL.ANNO_SOCIETARIO],
    importoCentesimi: row[ISCR_COL.IMPORTO_CENTESIMI],
    pagamentoStato: String(row[ISCR_COL.PAGAMENTO_STATO] || ""),
    pagamentoLinkUrl: String(row[ISCR_COL.PAGAMENTO_LINK_URL] || ""),
    pagamentoLinkId: String(row[ISCR_COL.PAGAMENTO_LINK_ID] || ""),
    pagamentoTotaleCentesimi: row[ISCR_COL.PAGAMENTO_TOTALE_CENTESIMI],
    pagamentoStripeLordo: row[ISCR_COL.PAGAMENTO_STRIPE_LORDO],
    pagamentoStripeFee: row[ISCR_COL.PAGAMENTO_STRIPE_FEE],
    pagamentoStripeNetto: row[ISCR_COL.PAGAMENTO_STRIPE_NETTO],
    pagamentoStripePi: String(row[ISCR_COL.PAGAMENTO_STRIPE_PI] || ""),
    pagamentoPagatoAt: row[ISCR_COL.PAGAMENTO_PAGATO_AT],
    createdAt: row[ISCR_COL.CREATED_AT],
    payloadJson: String(row[ISCR_COL.PAYLOAD_JSON] || ""),
    pdfUrl: String(row[ISCR_COL.PDF_URL] || ""),
    emailConfermaInviata: String(row[ISCR_COL.EMAIL_CONFERMA_INVIATA] || "")
  };
}

function getIscrizioneById(idIscrizione) {
  var rowNum = _iscrizioneFindRowById(idIscrizione);
  if (rowNum < 0) return null;
  var row = _getIscrizioniSheet().getRange(rowNum, 1, 1, ISCRIZIONI_HEADERS.length).getValues()[0];
  return _iscrizioneRowToObject(row);
}

function getStatoIscrizione(idIscrizione) {
  var rec = getIscrizioneById(idIscrizione);
  if (!rec) return { found: false };
  var inviata = !!String(rec.pdfUrl || "").trim();
  return {
    found: true,
    idIscrizione: rec.id,
    pagamentoStato: rec.pagamentoStato,
    pagato: String(rec.pagamentoStato || "").toUpperCase().trim() === "PAGATO",
    inviata: inviata,
    nome: rec.nome,
    cognome: rec.cognome,
    importoCentesimi: rec.importoCentesimi,
    pdfUrl: rec.pdfUrl
  };
}

/** Dati form salvati prima del pagamento (per ripristino in pagina iscrizione). */
function getDatiIscrizionePerForm(idIscrizione) {
  var rec = getIscrizioneById(idIscrizione);
  if (!rec || !rec.payloadJson) return { found: false };
  try {
    var data = JSON.parse(rec.payloadJson);
    var signatureData = String(data.signatureData || "");
    delete data.signatureData;
    var privacyAccepted = data.privacy_accepted === true
      || String(data.privacy_accepted || "").toLowerCase() === "true"
      || String(data.privacy_accepted || "") === "on";
    if (!privacyAccepted && signatureData) privacyAccepted = true;
    return {
      found: true,
      idIscrizione: rec.id,
      pagato: String(rec.pagamentoStato || "").toUpperCase().trim() === "PAGATO",
      inviata: !!String(rec.pdfUrl || "").trim(),
      fields: data,
      signatureData: signatureData,
      privacyAccepted: privacyAccepted
    };
  } catch (e) {
    return { found: false, message: e.message };
  }
}

function iscrizioneNeedsPostPaymentEmail(idIscrizione) {
  var rec = getIscrizioneById(idIscrizione);
  if (!rec) return false;
  if (String(rec.pagamentoStato || "").toUpperCase().trim() !== "PAGATO") return false;
  return String(rec.emailConfermaInviata || "").toUpperCase().trim() !== "SI";
}

var ISCRIZIONE_TOKEN_SHEET = "_ISCRIZIONE_TOKENS";
var ISCRIZIONE_MAGIC_LINK_TTL_MS = 24 * 60 * 60 * 1000;

function _iscrizioneAssociatiSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ISCRIZIONI_ID);
  var sheet = ss.getSheetByName(typeof ASSOCIATES_SHEET_NAME !== "undefined" ? ASSOCIATES_SHEET_NAME : "ASSOCIATI");
  if (!sheet) sheet = ss.getSheetByName("Associati");
  return sheet;
}

function _formatDateIsoForInput_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  var s = String(value).trim();
  var mIt = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mIt) {
    return mIt[3] + "-" + ("0" + mIt[2]).slice(-2) + "-" + ("0" + mIt[1]).slice(-2);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return s;
}

function _findAssociatoByCf_(cf) {
  var target = String(cf || "").toUpperCase().trim();
  if (!target) return null;
  var sheet = _iscrizioneAssociatiSheet_();
  if (!sheet || sheet.getLastRow() < 2) return null;
  var col = typeof COL_INDEX !== "undefined" ? COL_INDEX.CODICE_FISCALE : 12;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][col] || "").toUpperCase().trim() === target) {
      return { row: rows[i], rowNum: i + 2, email: String(rows[i][typeof COL_INDEX !== "undefined" ? COL_INDEX.EMAIL : 14] || "").trim() };
    }
  }
  return null;
}

function _findAssociatoByEmail_(email) {
  var target = String(email || "").toLowerCase().trim();
  if (!target) return null;
  var sheet = _iscrizioneAssociatiSheet_();
  if (!sheet || sheet.getLastRow() < 2) return null;
  var col = typeof COL_INDEX !== "undefined" ? COL_INDEX.EMAIL : 14;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][col] || "").toLowerCase().trim() === target) {
      return { row: rows[i], rowNum: i + 2, email: target };
    }
  }
  return null;
}

function _findAssociatoByIdentifier_(identifier) {
  var id = String(identifier || "").trim();
  if (!id) return null;
  if (id.indexOf("@") >= 0) return _findAssociatoByEmail_(id);
  if (id.length >= 11) return _findAssociatoByCf_(id);
  return null;
}

function _hasQuotaPagataAnnoCorrente_(cf) {
  var target = String(cf || "").toUpperCase().trim();
  if (!target) return false;
  var anno = new Date().getFullYear();
  var sheet = _getIscrizioniSheet();
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var data = sheet.getRange(2, 1, last - 1, ISCRIZIONI_HEADERS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (String(row[ISCR_COL.CF] || "").toUpperCase().trim() !== target) continue;
    if (parseInt(String(row[ISCR_COL.ANNO_SOCIETARIO] || ""), 10) !== anno) continue;
    if (String(row[ISCR_COL.PAGAMENTO_STATO] || "").toUpperCase().trim() === "PAGATO") return true;
  }
  return false;
}

function _associatoRowToFormFields_(row) {
  var C = typeof COL_INDEX !== "undefined" ? COL_INDEX : {
    NOME: 3, COGNOME: 4, LUOGO_NASCITA: 5, PROVINCIA_NASCITA: 6, DATA_NASCITA: 7,
    INDIRIZZO: 8, CAP: 9, CITTA: 10, PROVINCIA_RESIDENZA: 11, CODICE_FISCALE: 12,
    TELEFONO: 13, EMAIL: 14, TUTORE_NOME_MANUALE: 17, TUTORE_COGNOME_MANUALE: 18,
    TUTORE_CELLULARE_MANUALE: 19, TUTORE_EMAIL_MANUALE: 20, TUTORE_CF_MANUALE: 21
  };
  return {
    nome: String(row[C.NOME] || "").trim(),
    cognome: String(row[C.COGNOME] || "").trim(),
    luogo_nascita: String(row[C.LUOGO_NASCITA] || "").trim(),
    prov_nascita: String(row[C.PROVINCIA_NASCITA] || "").toUpperCase().trim(),
    data_nascita: _formatDateIsoForInput_(row[C.DATA_NASCITA]),
    cf: String(row[C.CODICE_FISCALE] || "").toUpperCase().trim(),
    indirizzo: String(row[C.INDIRIZZO] || "").trim(),
    cap: String(row[C.CAP] || "").trim(),
    citta: String(row[C.CITTA] || "").trim(),
    prov: String(row[C.PROVINCIA_RESIDENZA] || "").toUpperCase().trim(),
    email: String(row[C.EMAIL] || "").trim(),
    telefono: String(row[C.TELEFONO] || "").trim(),
    tutore_nome: String(row[C.TUTORE_NOME_MANUALE] || "").trim(),
    tutore_cognome: String(row[C.TUTORE_COGNOME_MANUALE] || "").trim(),
    tutore_telefono: String(row[C.TUTORE_CELLULARE_MANUALE] || "").trim(),
    tutore_email: String(row[C.TUTORE_EMAIL_MANUALE] || "").trim(),
    tutore_cf: String(row[C.TUTORE_CF_MANUALE] || "").toUpperCase().trim(),
    corso: "",
    rinnovo_associato: true
  };
}

function _ensureIscrizioneTokenSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ISCRIZIONI_ID);
  var sheet = ss.getSheetByName(ISCRIZIONE_TOKEN_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ISCRIZIONE_TOKEN_SHEET);
    sheet.getRange(1, 1, 1, 4).setValues([["Token", "Email", "Scadenza", "UsatoAt"]]).setFontWeight("bold");
    sheet.hideSheet();
  }
  return sheet;
}

function _iscrizioneMagicLinkBaseUrl_() {
  var base = String(PropertiesService.getScriptProperties().getProperty("STRIPE_RETURN_URL") || "").trim();
  if (!base) base = "https://iscrizione.musicproeventi.it/";
  return base.replace(/[?&].*$/, "").replace(/\/?$/, "/");
}

function _creaMagicLinkIscrizione_(associateEmail) {
  var token = Utilities.getUuid();
  var exp = new Date(Date.now() + ISCRIZIONE_MAGIC_LINK_TTL_MS);
  _ensureIscrizioneTokenSheet_().appendRow([token, String(associateEmail || "").trim(), exp, ""]);
  return _iscrizioneMagicLinkBaseUrl_() + "?iscrizioneToken=" + encodeURIComponent(token);
}

function _inviaMagicLinkIscrizionePerAssociato_(associato) {
  if (!associato || !associato.email) return false;
  var link = _creaMagicLinkIscrizione_(associato.email);
  var fields = _associatoRowToFormFields_(associato.row);
  var nome = fields.nome || "Associato";
  var body = "Ciao " + nome + ",\n\n"
    + "hai richiesto l'accesso al modulo di iscrizione MusicPro.\n"
    + "Apri il link qui sotto per verificare o aggiornare i tuoi dati e pagare la quota associativa:\n\n"
    + link + "\n\n"
    + "Il link è valido 24 ore.\n\nCordiali saluti,\nMusicPro Eventi";
  MailApp.sendEmail({
    to: associato.email,
    subject: "Link iscrizione / rinnovo quota MusicPro",
    body: body,
    name: "MusicPro Eventi"
  });
  return true;
}

function _valutaDuplicatoIscrizione_(data) {
  var cf = String(data.cf || "").toUpperCase().trim();
  var isRinnovo = data.rinnovo_associato === true
    || String(data.rinnovo_associato || "").toLowerCase() === "true";

  if (_hasQuotaPagataAnnoCorrente_(cf)) {
    return {
      blocked: true,
      code: "QUOTA_GIA_PAGATA",
      message: "La quota associativa risulta già pagata per quest'anno. Controlla la email o scrivi a musicproeventi@gmail.com."
    };
  }

  if (isRinnovo) return { blocked: false };

  var associato = _findAssociatoByCf_(cf);
  if (associato) {
    try { _inviaMagicLinkIscrizionePerAssociato_(associato); } catch (mailErr) {
      Logger.log("[_valutaDuplicatoIscrizione_] magic link: " + mailErr);
    }
    return {
      blocked: true,
      code: "GIA_ASSOCIATO",
      message: "Questo codice fiscale risulta già registrato. Ti abbiamo inviato un link personalizzato via email per aggiornare i dati e pagare la quota."
    };
  }
  return { blocked: false };
}

/**
 * Richiesta link magic (email o CF). Risposta sempre generica (privacy).
 */
function richiediLinkIscrizioneAssociato(identifier) {
  var msg = "Se i dati corrispondono a un associato registrato, riceverai via email un link personalizzato entro pochi minuti.";
  try {
    var associato = _findAssociatoByIdentifier_(identifier);
    if (associato && associato.email) _inviaMagicLinkIscrizionePerAssociato_(associato);
  } catch (e) {
    Logger.log("[richiediLinkIscrizioneAssociato] " + (e.message || e));
  }
  return { success: true, message: msg };
}

/**
 * Valida token magic link e restituisce dati form precompilati (uso singolo).
 */
function validateIscrizioneTokenAndGetForm(token) {
  var tok = String(token || "").trim();
  if (!tok) return { found: false, message: "Token mancante." };

  var sheet = _ensureIscrizioneTokenSheet_();
  if (sheet.getLastRow() < 2) return { found: false, message: "Link non valido o scaduto." };

  var rows = sheet.getDataRange().getValues();
  var rowIndex = -1;
  var rowInfo = null;
  for (var i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0] || "").trim() === tok) {
      rowInfo = {
        email: String(rows[i][1] || "").trim(),
        expiration: new Date(rows[i][2]),
        usedAt: String(rows[i][3] || "").trim()
      };
      rowIndex = i + 1;
      break;
    }
  }
  if (!rowInfo || rowIndex < 0) return { found: false, message: "Link non valido." };
  if (new Date() > rowInfo.expiration) return { found: false, message: "Link scaduto. Richiedine uno nuovo." };

  var associato = _findAssociatoByEmail_(rowInfo.email);
  if (!associato) return { found: false, message: "Associato non trovato." };

  var fields = _associatoRowToFormFields_(associato.row);
  return {
    found: true,
    rinnovo: true,
    nome: fields.nome,
    cognome: fields.cognome,
    fields: fields,
    privacyAccepted: true
  };
}

/**
 * Salva iscrizione, crea Payment Link, aggiorna stato INVIATO.
 * @returns {{ success: boolean, checkoutUrl?: string, idIscrizione?: string, message?: string }}
 */
function inviaIscrizioneConPagamento(data) {
  if (!data || !String(data.email || "").trim()) {
    throw new Error("Email obbligatoria.");
  }
  if (!String(data.nome || "").trim() || !String(data.cognome || "").trim()) {
    throw new Error("Nome e cognome obbligatori.");
  }
  if (!String(data.cf || "").trim()) {
    throw new Error("Codice fiscale obbligatorio.");
  }
  if (!data.signatureData) {
    throw new Error("Firma digitale obbligatoria.");
  }

  var dup = _valutaDuplicatoIscrizione_(data);
  if (dup.blocked) {
    return { success: false, code: dup.code, message: dup.message };
  }

  ensureIscrizioniSheet();
  var sheet = _getIscrizioniSheet();
  var idIscrizione = Utilities.getUuid();
  var now = new Date();
  var anno = now.getFullYear();
  var importoCents = QUOTA_ASSOCIATIVA_CENTESIMI;

  data.metodo_pagamento = "Stripe";
  var payloadJson = JSON.stringify(data);

  var row = new Array(ISCRIZIONI_HEADERS.length);
  for (var c = 0; c < row.length; c++) row[c] = "";
  row[ISCR_COL.ID] = idIscrizione;
  row[ISCR_COL.NOME] = String(data.nome || "").trim();
  row[ISCR_COL.COGNOME] = String(data.cognome || "").trim();
  row[ISCR_COL.EMAIL] = String(data.email || "").trim();
  row[ISCR_COL.CF] = String(data.cf || "").toUpperCase().trim();
  row[ISCR_COL.TELEFONO] = String(data.telefono || "").trim();
  row[ISCR_COL.ANNO_SOCIETARIO] = anno;
  row[ISCR_COL.IMPORTO_CENTESIMI] = importoCents;
  row[ISCR_COL.PAGAMENTO_STATO] = "PENDING";
  row[ISCR_COL.CREATED_AT] = now;
  row[ISCR_COL.PAYLOAD_JSON] = payloadJson;

  sheet.appendRow(row);
  var rowNum = sheet.getLastRow();

  var linkRes = createStripePaymentLinkQuotaAssociativa({
    idIscrizione: idIscrizione,
    nome: data.nome,
    cognome: data.cognome,
    importoCentesimi: importoCents,
    annoSocietario: anno,
    idempotencyKey: "iscrizione_" + idIscrizione
  });

  if (!linkRes || !linkRes.success || !linkRes.url) {
    sheet.getRange(rowNum, ISCR_COL.PAGAMENTO_STATO + 1).setValue("ERRORE");
    throw new Error((linkRes && linkRes.message) ? linkRes.message : "Impossibile creare il link di pagamento Stripe.");
  }

  sheet.getRange(rowNum, ISCR_COL.PAGAMENTO_STATO + 1).setValue("INVIATO");
  sheet.getRange(rowNum, ISCR_COL.PAGAMENTO_LINK_URL + 1).setValue(linkRes.url);
  sheet.getRange(rowNum, ISCR_COL.PAGAMENTO_LINK_ID + 1).setValue(linkRes.stripeId || "");
  sheet.getRange(rowNum, ISCR_COL.PAGAMENTO_TOTALE_CENTESIMI + 1).setValue(linkRes.totaleCents || importoCents);

  return {
    success: true,
    idIscrizione: idIscrizione,
    checkoutUrl: linkRes.url
  };
}

/**
 * Webhook: segna PAGATO (idempotente).
 * @returns {number} righe aggiornate (0 o 1)
 */
function aggiornaIscrizionePagamentoPagato(idIscrizione, finStripe, piId) {
  var rowNum = _iscrizioneFindRowById(idIscrizione);
  if (rowNum < 0) return 0;

  var sheet = _getIscrizioniSheet();
  var stato = String(sheet.getRange(rowNum, ISCR_COL.PAGAMENTO_STATO + 1).getValue() || "").toUpperCase().trim();
  if (stato === "PAGATO") return 0;

  sheet.getRange(rowNum, ISCR_COL.PAGAMENTO_STATO + 1).setValue("PAGATO");
  sheet.getRange(rowNum, ISCR_COL.PAGAMENTO_PAGATO_AT + 1).setValue(new Date());

  if (finStripe && finStripe.lordoCents != null) {
    sheet.getRange(rowNum, ISCR_COL.PAGAMENTO_STRIPE_LORDO + 1).setValue(finStripe.lordoCents);
  }
  if (finStripe && finStripe.feeCents != null) {
    sheet.getRange(rowNum, ISCR_COL.PAGAMENTO_STRIPE_FEE + 1).setValue(finStripe.feeCents);
  }
  if (finStripe && finStripe.netCents != null) {
    sheet.getRange(rowNum, ISCR_COL.PAGAMENTO_STRIPE_NETTO + 1).setValue(finStripe.netCents);
  }
  if (piId) {
    sheet.getRange(rowNum, ISCR_COL.PAGAMENTO_STRIPE_PI + 1).setValue(String(piId).substring(0, 64));
  }
  return 1;
}

/**
 * Invio finale: accoda PDF + email e risponde subito (elaborazione in background).
 */
function completaInvioIscrizione(idIscrizione) {
  var rec = getIscrizioneById(idIscrizione);
  if (!rec) throw new Error("Iscrizione non trovata.");
  if (String(rec.pagamentoStato || "").toUpperCase().trim() !== "PAGATO") {
    throw new Error("Pagamento non ancora confermato. Attendi qualche secondo e riprova.");
  }
  if (rec.pdfUrl || String(rec.emailConfermaInviata || "").toUpperCase().trim() === "SI") {
    return { success: true, alreadySent: true, name: rec.nome, pdfUrl: rec.pdfUrl || "" };
  }
  if (!rec.payloadJson) throw new Error("Dati iscrizione mancanti.");

  var emailSt = String(rec.emailConfermaInviata || "").toUpperCase().trim();
  if (emailSt === "IN_CORSO") {
    return { success: true, queued: true, name: rec.nome };
  }

  var sheet = _getIscrizioniSheet();
  var rowNum = _iscrizioneFindRowById(idIscrizione);
  sheet.getRange(rowNum, ISCR_COL.EMAIL_CONFERMA_INVIATA + 1).setValue("IN_CORSO");
  var sched = _scheduleIscrizioneInvio(idIscrizione);
  return {
    success: true,
    queued: !sched.done,
    alreadySent: !!sched.done,
    name: rec.nome
  };
}

function _scheduleIscrizioneInvio(idIscrizione) {
  _enqueueIscrizioneInvioDeferred({ id: idIscrizione });
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === "_deferredIscrizioneInvioWork") {
        return { scheduled: true, done: false };
      }
    }
    ScriptApp.newTrigger("_deferredIscrizioneInvioWork").timeBased().after(3 * 1000).create();
    return { scheduled: true, done: false };
  } catch (triggerErr) {
    Logger.log("[_scheduleIscrizioneInvio] esecuzione diretta: " + (triggerErr.message || triggerErr));
    _eseguiInvioIscrizioneSync(idIscrizione);
    return { scheduled: false, done: true };
  }
}

function _ensureIscrizioneInvioDeferredTrigger() {
  ScriptApp.newTrigger("_deferredIscrizioneInvioWork").timeBased().after(3 * 1000).create();
}

function _enqueueIscrizioneInvioDeferred(item) {
  if (!item || !item.id) return;
  var props = PropertiesService.getScriptProperties();
  var q = props.getProperty("ISCRIZIONE_INVIO_DEFERRED_QUEUE") || "[]";
  var arr = [];
  try { arr = JSON.parse(q); } catch (eQ) { arr = []; }
  var id = String(item.id);
  for (var j = 0; j < arr.length; j++) {
    if (arr[j] && String(arr[j].id) === id) return;
  }
  arr.push({ id: id, t: Date.now() });
  if (arr.length > 20) arr = arr.slice(-20);
  props.setProperty("ISCRIZIONE_INVIO_DEFERRED_QUEUE", JSON.stringify(arr));
}

/** @private trigger — genera PDF, aggiorna Associati, invia email */
function _deferredIscrizioneInvioWork() {
  var props = PropertiesService.getScriptProperties();
  var q = props.getProperty("ISCRIZIONE_INVIO_DEFERRED_QUEUE") || "[]";
  props.deleteProperty("ISCRIZIONE_INVIO_DEFERRED_QUEUE");
  var arr = [];
  try { arr = JSON.parse(q); } catch (eP) { return; }
  if (!arr.length) return;

  for (var i = 0; i < arr.length; i++) {
    var item = arr[i];
    if (!item || !item.id) continue;
    try {
      _eseguiInvioIscrizioneSync(item.id);
    } catch (itemErr) {
      Logger.log("[_deferredIscrizioneInvioWork] id=" + item.id + " " + (itemErr.message || itemErr));
      try {
        var rowNum = _iscrizioneFindRowById(item.id);
        if (rowNum > 0) {
          _getIscrizioniSheet().getRange(rowNum, ISCR_COL.EMAIL_CONFERMA_INVIATA + 1).setValue("ERRORE");
        }
      } catch (eMark) {}
    }
  }
}

function _eseguiInvioIscrizioneSync(idIscrizione) {
  var rec = getIscrizioneById(idIscrizione);
  if (!rec) throw new Error("Iscrizione non trovata.");
  if (rec.pdfUrl || String(rec.emailConfermaInviata || "").toUpperCase().trim() === "SI") return;

  var sheet = _getIscrizioniSheet();
  var rowNum = _iscrizioneFindRowById(idIscrizione);
  var data = JSON.parse(rec.payloadJson);
  data.metodo_pagamento = "Stripe";

  var pdfRes = processMembershipApplication(data);
  if (pdfRes && pdfRes.pdfUrl) {
    sheet.getRange(rowNum, ISCR_COL.PDF_URL + 1).setValue(pdfRes.pdfUrl);
  }
  sheet.getRange(rowNum, ISCR_COL.EMAIL_CONFERMA_INVIATA + 1).setValue("SI");
}

/**
 * Elabora domanda di iscrizione: PDF + foglio Associati + email con allegato.
 */
function processMembershipApplication(data) {
  Logger.log("--- INIZIO PROCESSO ISCRIZIONE ---");

  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ISCRIZIONI_ID);
    var sheetAssociati = ss.getSheetByName("ASSOCIATI") || ss.getSheetByName("Associati");
    if (!sheetAssociati) throw new Error("Foglio ASSOCIATI non trovato nello spreadsheet.");
    var cfSocio = (data.cf || "").toUpperCase().trim();
    if (!cfSocio) throw new Error("Codice Fiscale non ricevuto dal form.");

    var rows = sheetAssociati.getDataRange().getValues();
    var rowIndex = -1;
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][12] && rows[i][12].toString().toUpperCase().trim() === cfSocio) {
        rowIndex = i + 1;
        break;
      }
    }

    var docTemplate = DriveApp.getFileById(TEMPLATE_ISCRIZIONE_ID);
    var folder = DriveApp.getFolderById(FOLDER_ISCRIZIONI_ID);
    var newFileName = "Iscrizione - " + data.cognome + " " + data.nome;
    var copyFile = docTemplate.makeCopy(newFileName, folder);
    var doc = DocumentApp.openById(copyFile.getId());
    var body = doc.getBody();

    var numeroSocio = rowIndex > 0 ? rows[rowIndex - 1][0] : sheetAssociati.getLastRow();
    var dataNascitaFmt = data.data_nascita ? data.data_nascita.split("-").reverse().join("/") : "";
    var oggi = Utilities.formatDate(new Date(), "GMT+1", "dd/MM/yyyy");

    body.replaceText("{{NUMERO_SOCIO}}", numeroSocio.toString());
    body.replaceText("{{NOME}}", data.nome || "");
    body.replaceText("{{COGNOME}}", data.cognome || "");
    body.replaceText("{{LUOGO_NASCITA}}", data.luogo_nascita || "");
    body.replaceText("{{PROV_NASCITA}}", (data.prov_nascita || "").toUpperCase());
    body.replaceText("{{DATA_NASCITA}}", dataNascitaFmt);
    body.replaceText("{{INDIRIZZO}}", data.indirizzo || "");
    body.replaceText("{{CAP}}", data.cap || "");
    body.replaceText("{{CITTA}}", data.citta || "");
    body.replaceText("{{PROV}}", (data.prov || "").toUpperCase());
    body.replaceText("{{CF}}", cfSocio);
    body.replaceText("{{EMAIL}}", data.email || "");
    body.replaceText("{{TELEFONO}}", data.telefono || "");
    body.replaceText("{{CORSO}}", data.corso || "---");
    body.replaceText("{{QUOTA_ANNUALE}}", "€ 15,00");
    body.replaceText("{{DATA_OGGI}}", oggi);

    var nomeCompletoTutore = ((data.tutore_nome || "") + " " + (data.tutore_cognome || "")).trim();
    body.replaceText("{{TUTORE NOME}}", data.tutore_nome || "");
    body.replaceText("{{TUTORE COGNOME}}", data.tutore_cognome || "");
    body.replaceText("{{TUTORE NOME COMPLETO}}", nomeCompletoTutore);
    body.replaceText("{{TUTORE TELEFONO}}", data.tutore_telefono || "");
    body.replaceText("{{TUTORE EMAIL}}", data.tutore_email || "");
    body.replaceText("{{TUTORE_CF}}", (data.tutore_cf || "").toUpperCase());

    if (data.signatureData) {
      var signatureBase64 = data.signatureData.split(",")[1];
      var signatureBlob = Utilities.newBlob(Utilities.base64Decode(signatureBase64), "image/png");
      var found = body.findText("{{FIRMA}}");
      while (found) {
        var element = found.getElement();
        var textElement = element.asText();
        var start = found.getStartOffset();
        var end = found.getEndOffsetInclusive();
        var img = element.getParent().asParagraph().appendInlineImage(signatureBlob);
        img.setWidth(130).setHeight(50);
        textElement.deleteText(start, end);
        found = body.findText("{{FIRMA}}");
      }
    }

    doc.saveAndClose();
    var pdfBlob = copyFile.getAs(MimeType.PDF);
    var pdfFile = folder.createFile(pdfBlob).setName(newFileName + ".pdf");
    copyFile.setTrashed(true);

    var tutoreNome = data.tutore_nome || "";
    var tutoreCognome = data.tutore_cognome || "";
    var tutoreNomeCompleto = (tutoreNome + " " + tutoreCognome).trim();

    var rowData = [
      numeroSocio,
      new Date(),
      "15,00",
      data.nome,
      data.cognome,
      data.luogo_nascita,
      (data.prov_nascita || "").toUpperCase(),
      dataNascitaFmt,
      data.indirizzo,
      data.cap,
      data.citta,
      (data.prov || "").toUpperCase(),
      cfSocio,
      data.telefono,
      data.email,
      data.metodo_pagamento || "Stripe",
      tutoreNomeCompleto,
      tutoreNome,
      tutoreCognome,
      data.tutore_telefono || "",
      data.tutore_email || "",
      (data.tutore_cf || "").toUpperCase(),
      "",
      "SI",
      pdfFile.getUrl()
    ];

    if (rowIndex > 0) {
      sheetAssociati.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheetAssociati.appendRow(rowData);
    }

    var emailSubject = "Conferma Iscrizione MusicPro - " + data.nome + " " + data.cognome;
    var emailBody = "Ciao " + data.nome + ",\n\nin allegato trovi la tua domanda di iscrizione firmata.\n\nCordiali saluti,\nMusicPro Eventi";
    var pdfBlob = pdfFile.getAs(MimeType.PDF);

    if (!String(data.email || "").trim()) {
      throw new Error("Email destinatario mancante.");
    }

    try {
      MailApp.sendEmail({
        to: String(data.email).trim(),
        subject: emailSubject,
        body: emailBody,
        attachments: [pdfBlob],
        name: "MusicPro Eventi"
      });
    } catch (mailErr) {
      Logger.log("ERRORE email socio: " + mailErr);
      throw new Error("PDF creato ma impossibile inviare l'email: " + (mailErr.message || mailErr));
    }

    if (EMAIL_SEGRETERIA) {
      try {
        MailApp.sendEmail({
          to: EMAIL_SEGRETERIA,
          subject: "ISCRIZIONE: " + data.cognome + " " + data.nome,
          body: "Nuova iscrizione con pagamento Stripe.\nEmail socio: " + data.email,
          attachments: [pdfBlob],
          name: "MusicPro Iscrizioni"
        });
      } catch (mailSecErr) {
        Logger.log("ERRORE email segreteria (non bloccante): " + mailSecErr);
      }
    }

    return { success: true, name: data.nome, pdfUrl: pdfFile.getUrl() };
  } catch (e) {
    Logger.log("ERRORE CRITICO: " + e.toString());
    throw new Error("Errore durante l'elaborazione: " + e.message);
  }
}

function createIscrizioneJsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** API GET (proxy PHP o chiamata diretta): ?action=api&op=... */
function handleIscrizioneApiGet_(e) {
  var op = (e && e.parameter) ? String(e.parameter.op || "").trim() : "";
  var id = (e && e.parameter) ? String(e.parameter.idIscrizione || e.parameter.id || "").trim() : "";
  if (op === "getStatoIscrizione") {
    return createIscrizioneJsonOutput(getStatoIscrizione(id));
  }
  if (op === "getDatiIscrizionePerForm") {
    return createIscrizioneJsonOutput(getDatiIscrizionePerForm(id));
  }
  if (op === "sincronizzaPagamento") {
    var sync = typeof sincronizzaPagamentoIscrizioneStripe === "function"
      ? sincronizzaPagamentoIscrizioneStripe(id)
      : { found: false, pagato: false };
    var stato = getStatoIscrizione(id);
    return createIscrizioneJsonOutput(Object.assign({}, stato, sync, {
      pagato: !!(stato.pagato || sync.pagato)
    }));
  }
  if (op === "validateIscrizioneToken") {
    var tok = (e && e.parameter) ? String(e.parameter.token || "").trim() : "";
    return createIscrizioneJsonOutput(validateIscrizioneTokenAndGetForm(tok));
  }
  return createIscrizioneJsonOutput({ success: false, message: "Operazione GET non valida: " + op });
}

/**
 * doPost unificato: webhook Stripe + submit iscrizione.
 */
function doPost(e) {
  var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action).trim() : "";

  if (action === "stripeWebhookPagamento") {
    try {
      return createStripeWebhookAckOutput(gestioneStripeWebhookPagamento(e));
    } catch (whErr) {
      Logger.log("[doPost stripeWebhook] " + (whErr.message || whErr));
      return createStripeWebhookAckOutput({ received: true, ok: false, message: String(whErr.message || whErr) });
    }
  }

  try {
    var raw = (e && e.postData && e.postData.contents) ? String(e.postData.contents) : "";
    var data = raw ? JSON.parse(raw) : {};
    var bodyAction = String(data.action || action || "inviaIscrizione").trim();

    if (bodyAction === "getStatoIscrizione") {
      return createIscrizioneJsonOutput(getStatoIscrizione(data.idIscrizione || data.id));
    }

    if (bodyAction === "getDatiIscrizionePerForm") {
      return createIscrizioneJsonOutput(getDatiIscrizionePerForm(data.idIscrizione || data.id));
    }

    if (bodyAction === "completaInvioIscrizione") {
      return createIscrizioneJsonOutput(completaInvioIscrizione(data.idIscrizione || data.id));
    }

    if (bodyAction === "richiediLinkIscrizioneAssociato") {
      return createIscrizioneJsonOutput(richiediLinkIscrizioneAssociato(data.identifier || data.email || data.cf));
    }

    if (bodyAction === "inviaIscrizione" || bodyAction === "inviaIscrizioneConPagamento") {
      var result = inviaIscrizioneConPagamento(data);
      return createIscrizioneJsonOutput(result);
    }

    var legacy = inviaIscrizioneConPagamento(data);
    return createIscrizioneJsonOutput(legacy);
  } catch (err) {
    Logger.log("ERRORE doPost iscrizione: " + err.toString());
    return createIscrizioneJsonOutput({ success: false, message: err.message || String(err) });
  }
}

function testInternoIscrizione() {
  return testFlussoQuotaAssociativa();
}
