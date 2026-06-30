/**
 * @version 4.0 - Iscrizioni con pagamento Stripe (Payment Link + webhook)
 */

const TEMPLATE_ISCRIZIONE_ID = "1CVxLAsEweuZD11N6V3CBkaNqegG6c2BeOT9WZLSw63I";
const FOLDER_ISCRIZIONI_ID = "1XCo-t2VwgOr6Pu7cWiiNcSxz4CXgPe6T";
/** Cartella Drive piatta "Iscrizioni" — moduli PDF dal form online (comportamento fino a giu 2025). */
const EMAIL_SEGRETERIA = "musicproeventi@gmail.com";
const ISCRIZIONI_SHEET_NAME = "ISCRIZIONI";
const ISCRIZIONI_ARCHIVIO_SHEET_NAME = "ISCRIZIONI_ARCHIVIO";
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

function _getOrCreateIscrizioniArchivioSheet_(ss) {
  var spreadsheet = ss || SpreadsheetApp.openById(SPREADSHEET_ISCRIZIONI_ID);
  var sheet = spreadsheet.getSheetByName(ISCRIZIONI_ARCHIVIO_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(ISCRIZIONI_ARCHIVIO_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    var archivioHeaders = ISCRIZIONI_HEADERS.concat(["Archiviata_At"]);
    sheet.getRange(1, 1, 1, archivioHeaders.length).setValues([archivioHeaders]).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Sposta una riga completata da ISCRIZIONI → ISCRIZIONI_ARCHIVIO (storico pagamenti Stripe). */
function _archiviaRigaIscrizioneCompletata_(rowNum) {
  if (!rowNum || rowNum < 2) return false;
  var ss = SpreadsheetApp.openById(SPREADSHEET_ISCRIZIONI_ID);
  var sheet = _getIscrizioniSheet();
  if (rowNum > sheet.getLastRow()) return false;

  var row = sheet.getRange(rowNum, 1, 1, ISCRIZIONI_HEADERS.length).getValues()[0];
  if (!String(row[ISCR_COL.ID] || "").trim()) return false;

  var archivio = _getOrCreateIscrizioniArchivioSheet_(ss);
  var archivioRow = row.concat([new Date()]);
  archivio.appendRow(archivioRow);
  sheet.deleteRow(rowNum);
  return true;
}

/** Archivia tutte le righe già completate ancora presenti in ISCRIZIONI (pulizia retroattiva). */
function _archiviaIscrizioniCompletateInBatch_() {
  var sheet = _getIscrizioniSheet();
  var last = sheet.getLastRow();
  if (last < 2) return 0;

  var data = sheet.getRange(2, 1, last - 1, ISCRIZIONI_HEADERS.length).getValues();
  var archived = 0;
  for (var i = data.length - 1; i >= 0; i--) {
    var rec = _iscrizioneRowToObject(data[i]);
    if (!rec || !rec.id) continue;

    var pag = String(rec.pagamentoStato || "").toUpperCase().trim();
    var emailSt = String(rec.emailConfermaInviata || "").toUpperCase().trim();
    var hasPdf = !!String(rec.pdfUrl || "").trim();
    var completata = pag === "PAGATO" && emailSt === "SI" && hasPdf;
    if (!completata) continue;

    if (_archiviaRigaIscrizioneCompletata_(i + 2)) archived++;
  }
  return archived;
}

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

function _findRowInSheetById_(sheet, idIscrizione) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, ISCR_COL.ID + 1, last - 1, 1).getValues();
  var target = String(idIscrizione || "").trim();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || "").trim() === target) return i + 2;
  }
  return -1;
}

function _locateIscrizioneRowById_(idIscrizione) {
  var sheet = _getIscrizioniSheet();
  var rowNum = _findRowInSheetById_(sheet, idIscrizione);
  if (rowNum > 0) return { sheet: sheet, rowNum: rowNum, inArchivio: false };

  var archivio = _getOrCreateIscrizioniArchivioSheet_();
  rowNum = _findRowInSheetById_(archivio, idIscrizione);
  if (rowNum > 0) return { sheet: archivio, rowNum: rowNum, inArchivio: true };
  return null;
}

function _iscrizioneFindRowById(idIscrizione) {
  return _findRowInSheetById_(_getIscrizioniSheet(), idIscrizione);
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
  var located = _locateIscrizioneRowById_(idIscrizione);
  if (!located) return null;
  var row = located.sheet.getRange(located.rowNum, 1, 1, ISCRIZIONI_HEADERS.length).getValues()[0];
  return _iscrizioneRowToObject(row);
}

function getStatoIscrizione(idIscrizione) {
  var rec = getIscrizioneById(idIscrizione);
  if (!rec) return { found: false };
  var emailSt = String(rec.emailConfermaInviata || "").toUpperCase().trim();
  var inviata = emailSt === "SI" || !!String(rec.pdfUrl || "").trim();
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
  var emailSt = String(rec.emailConfermaInviata || "").toUpperCase().trim();
  if (emailSt === "IN_CORSO") return false;
  var hasPdf = !!String(rec.pdfUrl || "").trim();
  if (hasPdf && emailSt === "SI") return false;
  return true;
}

/** Accoda PDF + email se pagamento ok ma invio non ancora partito. */
function accodaInvioEmailIscrizioneSeNecessario(idIscrizione) {
  if (!iscrizioneNeedsPostPaymentEmail(idIscrizione)) return false;
  try {
    _eseguiInvioIscrizioneSync(idIscrizione);
    return true;
  } catch (syncErr) {
    Logger.log("[accodaInvioEmailIscrizioneSeNecessario] sync: " + (syncErr.message || syncErr));
    _scheduleIscrizioneInvio(idIscrizione);
    return true;
  }
}

function _findAssociatoRowByCf_(sheetAssociati, cfSocio) {
  var cf = String(cfSocio || "").toUpperCase().trim();
  var last = sheetAssociati.getLastRow();
  if (last < 2) return { rowIndex: -1, numeroSocio: null };

  var data = sheetAssociati.getRange(2, 1, last - 1, sheetAssociati.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    var rowCf = data[i][12] ? data[i][12].toString().toUpperCase().trim() : "";
    if (rowCf === cf) {
      return { rowIndex: i + 2, numeroSocio: data[i][0] };
    }
  }
  return { rowIndex: -1, numeroSocio: null };
}

function _nextNumeroAssociatoFromSheet_(sheetAssociati) {
  var last = sheetAssociati.getLastRow();
  if (last < 2) return 1;
  var nums = sheetAssociati.getRange(2, 1, last - 1, 1).getValues();
  var maxNum = 0;
  for (var i = 0; i < nums.length; i++) {
    var n = parseInt(String(nums[i][0] || ""), 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  }
  return maxNum + 1;
}

/** Destinazione PDF iscrizione online: cartella piatta "Iscrizioni" su Drive. */
function _getIscrizionePdfFolder_(data) {
  return DriveApp.getFolderById(FOLDER_ISCRIZIONI_ID);
}

/** Copia opzionale anche in ROOT_ISCRIZIONI/Cognome Nome (archivio per associato). */
function _mirrorIscrizionePdfInRootFolder_(pdfFile, data) {
  if (typeof ROOT_ISCRIZIONI_FOLDER_ID === "undefined" || !ROOT_ISCRIZIONI_FOLDER_ID) return;
  if (typeof getOrCreateFolder !== "function") return;
  try {
    var rootFolder = DriveApp.getFolderById(ROOT_ISCRIZIONI_FOLDER_ID);
    var folderName = ((data.cognome || "") + " " + (data.nome || "")).trim();
    if (!folderName) return;
    var subFolder = getOrCreateFolder(rootFolder, folderName);
    pdfFile.makeCopy(pdfFile.getName(), subFolder);
  } catch (mirrorErr) {
    Logger.log("[_mirrorIscrizionePdfInRootFolder_] " + (mirrorErr.message || mirrorErr));
  }
}

function _getAdminNotificaEmails_() {
  var emails = [];
  if (EMAIL_SEGRETERIA) emails.push(String(EMAIL_SEGRETERIA).trim());
  if (typeof ADMIN_EMAIL !== "undefined" && ADMIN_EMAIL) {
    var admin = String(ADMIN_EMAIL).trim();
    if (emails.indexOf(admin) < 0) emails.push(admin);
  }
  return emails;
}

function _inviaEmailIscrizione_(data, pdfBlob) {
  var emailTo = String(data.email || "").trim();
  if (!emailTo) throw new Error("Email destinatario mancante.");

  MailApp.sendEmail({
    to: emailTo,
    subject: "Conferma Iscrizione MusicPro - " + data.nome + " " + data.cognome,
    body: "Ciao " + data.nome + ",\n\nin allegato trovi la tua domanda di iscrizione firmata.\n\nCordiali saluti,\nMusicPro Eventi",
    attachments: [pdfBlob],
    name: "MusicPro Eventi"
  });

  var adminEmails = _getAdminNotificaEmails_();
  for (var a = 0; a < adminEmails.length; a++) {
    try {
      MailApp.sendEmail({
        to: adminEmails[a],
        subject: "ISCRIZIONE: " + data.cognome + " " + data.nome,
        body: "Nuova iscrizione con pagamento Stripe.\nEmail socio: " + emailTo,
        attachments: [pdfBlob],
        name: "MusicPro Iscrizioni"
      });
    } catch (adminErr) {
      Logger.log("ERRORE email admin " + adminEmails[a] + ": " + (adminErr.message || adminErr));
    }
  }
}

function _formatIscrizioneDateForUi_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  }
  return String(value);
}

function _iscrizioneStatoLabel_(rec) {
  var pag = String(rec.pagamentoStato || "").toUpperCase().trim();
  var emailSt = String(rec.emailConfermaInviata || "").toUpperCase().trim();
  var hasPdf = !!String(rec.pdfUrl || "").trim();
  if (emailSt === "SI" && !hasPdf) return "PDF mancante";
  if (emailSt === "SI" && hasPdf) return "Completata";
  if (emailSt === "ERRORE") return "Errore invio";
  if (emailSt === "IN_CORSO") return "Invio in corso";
  if (pag === "PAGATO") return "Pagata — da finalizzare";
  if (pag === "INVIATO") return "In attesa pagamento";
  if (pag === "ERRORE") return "Errore Stripe";
  if (pag === "PENDING") return "In elaborazione";
  return pag || "Sconosciuto";
}

/**
 * Registra o aggiorna il pagamento quota nel foglio QUOTE (chiave: Nome Cognome + anno).
 */
function _registraQuotaDaIscrizione_(ss, data, anno) {
  if (typeof _getOrCreateQuoteSheet_ !== "function") return;
  var nome = String(data.nome || "").trim();
  var cognome = String(data.cognome || "").trim();
  var fullName = (nome + " " + cognome).trim();
  if (!fullName) return;

  var year = parseInt(String(anno || new Date().getFullYear()), 10);
  var quoteSheet = _getOrCreateQuoteSheet_(ss);
  var paymentDate = new Date();
  var importoEuro = (typeof QUOTA_ASSOCIATIVA_CENTESIMI !== "undefined" ? QUOTA_ASSOCIATIVA_CENTESIMI : 1500) / 100;

  if (typeof getQuotaSettings === "function") {
    var settings = getQuotaSettings();
    for (var s = 0; s < settings.length; s++) {
      if (parseInt(String(settings[s].year), 10) === year && settings[s].amount) {
        importoEuro = settings[s].amount;
        break;
      }
    }
  }

  var quoteData = quoteSheet.getDataRange().getValues();
  var existingRowIndex = -1;
  for (var i = 1; i < quoteData.length; i++) {
    if (String(quoteData[i][0] || "").trim() === fullName
      && String(quoteData[i][1] || "").trim() === String(year)) {
      existingRowIndex = i + 1;
      break;
    }
  }

  if (existingRowIndex > -1) {
    quoteSheet.getRange(existingRowIndex, 3).setValue(paymentDate);
    quoteSheet.getRange(existingRowIndex, 4).setValue(importoEuro);
  } else {
    quoteSheet.appendRow([fullName, year, paymentDate, importoEuro]);
  }
}

function _pushIscrizioneInSospesoItem_(out, rec, extra) {
  var pag = String(rec.pagamentoStato || "").toUpperCase().trim();
  var emailSt = String(rec.emailConfermaInviata || "").toUpperCase().trim();
  var hasPdf = !!String(rec.pdfUrl || "").trim();
  if (pag === "PAGATO" && emailSt === "SI" && hasPdf) return;

  out.push(Object.assign({
    id: rec.id,
    nome: rec.nome,
    cognome: rec.cognome,
    email: rec.email,
    cf: rec.cf,
    telefono: rec.telefono,
    pagamentoStato: pag,
    emailConfermaInviata: emailSt,
    createdAt: _formatIscrizioneDateForUi_(rec.createdAt),
    pagamentoPagatoAt: _formatIscrizioneDateForUi_(rec.pagamentoPagatoAt),
    pagamentoLinkUrl: rec.pagamentoLinkUrl,
    pdfUrl: rec.pdfUrl,
    statoLabel: _iscrizioneStatoLabel_(rec)
  }, extra || {}));
}

/**
 * Elenco iscrizioni online non ancora completate (admin GAS).
 * Include anche righe in ISCRIZIONI_ARCHIVIO senza PDF/email.
 */
function getIscrizioniInSospeso() {
  ensureIscrizioniSheet();
  _archiviaIscrizioniCompletateInBatch_();

  var out = [];
  var sheets = [_getIscrizioniSheet(), _getOrCreateIscrizioniArchivioSheet_()];
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var inArchivio = sheet.getName() === ISCRIZIONI_ARCHIVIO_SHEET_NAME;
    var last = sheet.getLastRow();
    if (last < 2) continue;
    var data = sheet.getRange(2, 1, last - 1, ISCRIZIONI_HEADERS.length).getValues();
    for (var i = data.length - 1; i >= 0; i--) {
      var rec = _iscrizioneRowToObject(data[i]);
      if (!rec || !rec.id) continue;
      _pushIscrizioneInSospesoItem_(out, rec, { inArchivio: inArchivio });
    }
  }
  return out;
}

/** Admin: sincronizza pagamento Stripe per una iscrizione. */
function adminSincronizzaIscrizione(idIscrizione) {
  var sync = typeof sincronizzaPagamentoIscrizioneStripe === "function"
    ? sincronizzaPagamentoIscrizioneStripe(idIscrizione)
    : { found: false, pagato: false };
  var stato = getStatoIscrizione(idIscrizione);
  return {
    success: true,
    sync: sync,
    stato: stato,
    message: sync.pagato
      ? "Pagamento confermato su Stripe."
      : (sync.message || "Pagamento non ancora risulta completato su Stripe.")
  };
}

/** Admin: avvia PDF + email + scrittura ASSOCIATI/QUOTE. */
function adminCompletaInvioIscrizione(idIscrizione) {
  return completaInvioIscrizione(idIscrizione);
}

/** Admin: rigenera PDF Drive + reinvia email (anche se già in archivio). */
function adminRigeneraInvioIscrizione(idIscrizione) {
  _eseguiInvioIscrizioneSync(idIscrizione, { force: true });
  var rec = getIscrizioneById(idIscrizione);
  return {
    success: true,
    idIscrizione: idIscrizione,
    pdfUrl: rec ? rec.pdfUrl : "",
    name: rec ? rec.nome : ""
  };
}

/**
 * Admin: unico pulsante — completa prima volta o rigenera se PDF/email mancanti o in errore.
 */
function adminFinisciInvioIscrizione(idIscrizione) {
  var rec = getIscrizioneById(idIscrizione);
  if (!rec) throw new Error("Iscrizione non trovata.");
  if (String(rec.pagamentoStato || "").toUpperCase().trim() !== "PAGATO") {
    throw new Error("Pagamento non ancora confermato. Usa Sync Stripe se necessario.");
  }

  var emailSt = String(rec.emailConfermaInviata || "").toUpperCase().trim();
  var hasPdf = !!String(rec.pdfUrl || "").trim();
  if (hasPdf && emailSt === "SI") {
    return { success: true, alreadySent: true, name: rec.nome, pdfUrl: rec.pdfUrl || "" };
  }

  var needsForce = !hasPdf || emailSt === "ERRORE";
  if (needsForce) {
    return adminRigeneraInvioIscrizione(idIscrizione);
  }
  return completaInvioIscrizione(idIscrizione);
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

function _normalizeNameKey_(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Confronto flessibile Nome/Cognome vs cella QUOTE (ordine, spazi, maiuscole). */
function _quoteNameMatchesAssociato_(nome, cognome, quoteNameCell) {
  var key = _normalizeNameKey_(quoteNameCell);
  var n = _normalizeNameKey_(nome);
  var c = _normalizeNameKey_(cognome);
  if (!key || !n || !c) return false;
  if (key === (n + " " + c) || key === (c + " " + n)) return true;
  return key.indexOf(n) >= 0 && key.indexOf(c) >= 0;
}

function _scanIscrizioniPagatoPerCf_(cf, anno, sheet) {
  if (!sheet) return false;
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var target = String(cf || "").toUpperCase().trim();
  var data = sheet.getRange(2, 1, last - 1, ISCRIZIONI_HEADERS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (String(row[ISCR_COL.CF] || "").toUpperCase().trim() !== target) continue;
    if (parseInt(String(row[ISCR_COL.ANNO_SOCIETARIO] || ""), 10) !== anno) continue;
    if (String(row[ISCR_COL.PAGAMENTO_STATO] || "").toUpperCase().trim() === "PAGATO") return true;
  }
  return false;
}

function _hasQuotaPagataInQuoteSheet_(nome, cognome, anno) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ISCRIZIONI_ID);
  var quoteSheetName = typeof QUOTE_SHEET_NAME !== "undefined" ? QUOTE_SHEET_NAME : "QUOTE";
  var quoteSheet = ss.getSheetByName(quoteSheetName);
  if (!quoteSheet || quoteSheet.getLastRow() <= 1) return false;

  var yearStr = String(anno);
  var quoteData = quoteSheet.getDataRange().getValues();
  for (var i = 1; i < quoteData.length; i++) {
    var row = quoteData[i];
    if (!_quoteNameMatchesAssociato_(nome, cognome, row[0])) continue;
    if (String(row[1] || "").trim() !== yearStr) continue;
    return true;
  }
  return false;
}

function _hasQuotaPagataAnnoCorrente_(cf, associatoOpt) {
  var target = String(cf || "").toUpperCase().trim();
  if (!target) return false;
  var anno = new Date().getFullYear();

  if (_scanIscrizioniPagatoPerCf_(target, anno, _getIscrizioniSheet())) return true;
  if (_scanIscrizioniPagatoPerCf_(target, anno, _getOrCreateIscrizioniArchivioSheet_())) return true;

  var associato = associatoOpt || _findAssociatoByCf_(target);
  if (!associato) return false;

  var C = typeof COL_INDEX !== "undefined" ? COL_INDEX : { NOME: 3, COGNOME: 4 };
  var nome = String(associato.row[C.NOME] || "").trim();
  var cognome = String(associato.row[C.COGNOME] || "").trim();

  if (_hasQuotaPagataInQuoteSheet_(nome, cognome, anno)) return true;

  var fullName = (nome + " " + cognome).trim();
  if (fullName && typeof getQuotaStatus === "function") {
    var quotaDate = getQuotaStatus(fullName, anno);
    if (quotaDate) return true;
    var quotaDateAlt = getQuotaStatus((cognome + " " + nome).trim(), anno);
    if (quotaDateAlt) return true;
  }

  return false;
}

function _applicaAggiornamentoAssociatoDaForm_(associato, data) {
  var sheet = _iscrizioneAssociatiSheet_();
  var rowNum = associato.rowNum;
  var C = typeof COL_INDEX !== "undefined" ? COL_INDEX : {
    NOME: 3, COGNOME: 4, LUOGO_NASCITA: 5, PROVINCIA_NASCITA: 6, DATA_NASCITA: 7,
    INDIRIZZO: 8, CAP: 9, CITTA: 10, PROVINCIA_RESIDENZA: 11, CODICE_FISCALE: 12,
    TELEFONO: 13, EMAIL: 14, NOME_COMPLETO_TUTORE: 16,
    TUTORE_NOME_MANUALE: 17, TUTORE_COGNOME_MANUALE: 18, TUTORE_CELLULARE_MANUALE: 19,
    TUTORE_EMAIL_MANUALE: 20, TUTORE_CF_MANUALE: 21
  };

  sheet.getRange(rowNum, C.NOME + 1).setValue(String(data.nome || "").trim());
  sheet.getRange(rowNum, C.COGNOME + 1).setValue(String(data.cognome || "").trim());
  sheet.getRange(rowNum, C.LUOGO_NASCITA + 1).setValue(String(data.luogo_nascita || "").trim());
  sheet.getRange(rowNum, C.PROVINCIA_NASCITA + 1).setValue(String(data.prov_nascita || "").toUpperCase().trim());
  if (data.data_nascita) {
    var dataNascitaVal = typeof parseDateFromInput === "function"
      ? parseDateFromInput(data.data_nascita)
      : data.data_nascita;
    sheet.getRange(rowNum, C.DATA_NASCITA + 1).setValue(dataNascitaVal);
  }
  sheet.getRange(rowNum, C.INDIRIZZO + 1).setValue(String(data.indirizzo || "").trim());
  sheet.getRange(rowNum, C.CAP + 1).setValue(String(data.cap || "").trim());
  sheet.getRange(rowNum, C.CITTA + 1).setValue(String(data.citta || "").trim());
  sheet.getRange(rowNum, C.PROVINCIA_RESIDENZA + 1).setValue(String(data.prov || "").toUpperCase().trim());
  sheet.getRange(rowNum, C.CODICE_FISCALE + 1).setValue(String(data.cf || "").toUpperCase().trim());
  sheet.getRange(rowNum, C.TELEFONO + 1).setValue(String(data.telefono || "").trim());
  sheet.getRange(rowNum, C.EMAIL + 1).setValue(String(data.email || "").trim());

  var tutoreNome = String(data.tutore_nome || "").trim();
  var tutoreCognome = String(data.tutore_cognome || "").trim();
  var tutoreNomeCompleto = (tutoreNome + " " + tutoreCognome).trim();
  sheet.getRange(rowNum, C.NOME_COMPLETO_TUTORE + 1).setValue(tutoreNomeCompleto);
  sheet.getRange(rowNum, C.TUTORE_NOME_MANUALE + 1).setValue(tutoreNome);
  sheet.getRange(rowNum, C.TUTORE_COGNOME_MANUALE + 1).setValue(tutoreCognome);
  sheet.getRange(rowNum, C.TUTORE_CELLULARE_MANUALE + 1).setValue(String(data.tutore_telefono || "").trim());
  sheet.getRange(rowNum, C.TUTORE_EMAIL_MANUALE + 1).setValue(String(data.tutore_email || "").trim());
  sheet.getRange(rowNum, C.TUTORE_CF_MANUALE + 1).setValue(String(data.tutore_cf || "").toUpperCase().trim());

  SpreadsheetApp.flush();
}

/**
 * Associato già in rubrica con quota pagata: aggiorna solo anagrafica (no Stripe).
 */
function salvaAggiornamentoAssociatoIscrizione(data) {
  var isRinnovo = data.rinnovo_associato === true
    || String(data.rinnovo_associato || "").toLowerCase() === "true";
  if (!isRinnovo) {
    throw new Error("Operazione riservata agli associati già registrati.");
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

  var cf = String(data.cf || "").toUpperCase().trim();
  var associato = _findAssociatoByCf_(cf);
  if (!associato) {
    throw new Error("Associato non trovato in rubrica. Contatta la segreteria.");
  }
  if (!_hasQuotaPagataAnnoCorrente_(cf, associato)) {
    return {
      success: false,
      code: "QUOTA_NON_PAGATA",
      message: "La quota associativa per quest'anno non risulta ancora pagata. Procedi al pagamento."
    };
  }

  _applicaAggiornamentoAssociatoDaForm_(associato, data);

  return {
    success: true,
    skipPayment: true,
    message: "Dati aggiornati con successo. La quota per quest'anno risulta già pagata.",
    nome: String(data.nome || "").trim()
  };
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
  var quotaGiaPagata = _hasQuotaPagataAnnoCorrente_(fields.cf, associato);
  var azioneLine = quotaGiaPagata
    ? "Apri il link qui sotto per verificare o aggiornare i tuoi dati anagrafici:"
    : "Apri il link qui sotto per verificare o aggiornare i tuoi dati e pagare la quota associativa:";
  var body = "Ciao " + nome + ",\n\n"
    + "hai richiesto l'accesso al modulo di iscrizione MusicPro.\n"
    + azioneLine + "\n\n"
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
    if (isRinnovo) {
      return { blocked: false, skipPayment: true };
    }
    return {
      blocked: true,
      code: "QUOTA_GIA_PAGATA",
      message: "La quota associativa risulta già pagata per quest'anno. Usa il link personalizzato per aggiornare i dati."
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
  var quotaGiaPagata = _hasQuotaPagataAnnoCorrente_(fields.cf, associato);
  return {
    found: true,
    rinnovo: true,
    quotaGiaPagata: quotaGiaPagata,
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
  if (dup.skipPayment) {
    return salvaAggiornamentoAssociatoIscrizione(data);
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
  if (stato === "PAGATO") {
    accodaInvioEmailIscrizioneSeNecessario(idIscrizione);
    return 0;
  }

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
  accodaInvioEmailIscrizioneSeNecessario(idIscrizione);
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
  var emailSt = String(rec.emailConfermaInviata || "").toUpperCase().trim();
  var hasPdf = !!String(rec.pdfUrl || "").trim();
  if (hasPdf && emailSt === "SI") {
    return { success: true, alreadySent: true, name: rec.nome, pdfUrl: rec.pdfUrl || "" };
  }
  if (!rec.payloadJson) throw new Error("Dati iscrizione mancanti.");

  var located = _locateIscrizioneRowById_(idIscrizione);
  if (located && !located.inArchivio) {
    located.sheet.getRange(located.rowNum, ISCR_COL.EMAIL_CONFERMA_INVIATA + 1).setValue("IN_CORSO");
  }

  try {
    _eseguiInvioIscrizioneSync(idIscrizione);
    rec = getIscrizioneById(idIscrizione);
    return {
      success: true,
      queued: false,
      alreadySent: false,
      name: rec ? rec.nome : "",
      pdfUrl: rec ? rec.pdfUrl : ""
    };
  } catch (err) {
    if (located) {
      try {
        located.sheet.getRange(located.rowNum, ISCR_COL.EMAIL_CONFERMA_INVIATA + 1).setValue("ERRORE");
      } catch (eMark) {}
    }
    throw err;
  }
}

function _scheduleIscrizioneInvio(idIscrizione) {
  _enqueueIscrizioneInvioDeferred({ id: idIscrizione });
  try {
    var hasPending = false;
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === "_deferredIscrizioneInvioWork") {
        hasPending = true;
        break;
      }
    }
    if (!hasPending) {
      ScriptApp.newTrigger("_deferredIscrizioneInvioWork").timeBased().after(3 * 1000).create();
    }
    return { scheduled: true, done: false };
  } catch (triggerErr) {
    Logger.log("[_scheduleIscrizioneInvio] esecuzione diretta: " + (triggerErr.message || triggerErr));
    _deferredIscrizioneInvioWork();
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
        var located = _locateIscrizioneRowById_(item.id);
        if (located) {
          located.sheet.getRange(located.rowNum, ISCR_COL.EMAIL_CONFERMA_INVIATA + 1).setValue("ERRORE");
        }
      } catch (eMark) {}
    }
  }
}

function _eseguiInvioIscrizioneSync(idIscrizione, options) {
  options = options || {};
  var located = _locateIscrizioneRowById_(idIscrizione);
  if (!located) throw new Error("Iscrizione non trovata.");

  var row = located.sheet.getRange(located.rowNum, 1, 1, ISCRIZIONI_HEADERS.length).getValues()[0];
  var rec = _iscrizioneRowToObject(row);
  if (!rec || !rec.payloadJson) throw new Error("Dati iscrizione mancanti.");

  var emailSt = String(rec.emailConfermaInviata || "").toUpperCase().trim();
  var hasPdf = !!String(rec.pdfUrl || "").trim();
  if (!options.force && hasPdf && emailSt === "SI") {
    if (!located.inArchivio) _archiviaRigaIscrizioneCompletata_(located.rowNum);
    return;
  }

  var data = JSON.parse(rec.payloadJson);
  data.metodo_pagamento = "Stripe";

  var pdfRes = processMembershipApplication(data);
  if (!pdfRes || !pdfRes.pdfUrl) {
    throw new Error("Generazione PDF non riuscita.");
  }

  located.sheet.getRange(located.rowNum, ISCR_COL.PDF_URL + 1).setValue(pdfRes.pdfUrl);
  located.sheet.getRange(located.rowNum, ISCR_COL.EMAIL_CONFERMA_INVIATA + 1).setValue("SI");

  if (!located.inArchivio) {
    _archiviaRigaIscrizioneCompletata_(located.rowNum);
  }
}

/**
 * Elabora domanda di iscrizione: PDF + foglio Associati + email con allegato.
 */
function processMembershipApplication(data) {
  Logger.log("--- INIZIO PROCESSO ISCRIZIONE ---");

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(120000)) {
    throw new Error("Sistema occupato nella assegnazione numero associato. Riprova tra poco.");
  }

  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ISCRIZIONI_ID);
    var sheetAssociati = ss.getSheetByName("ASSOCIATI") || ss.getSheetByName("Associati");
    if (!sheetAssociati) throw new Error("Foglio ASSOCIATI non trovato nello spreadsheet.");
    var cfSocio = (data.cf || "").toUpperCase().trim();
    if (!cfSocio) throw new Error("Codice Fiscale non ricevuto dal form.");

    var found = _findAssociatoRowByCf_(sheetAssociati, cfSocio);
    var rowIndex = found.rowIndex;
    var numeroSocio = rowIndex > 0 ? found.numeroSocio : _nextNumeroAssociatoFromSheet_(sheetAssociati);

    var docTemplate = DriveApp.getFileById(TEMPLATE_ISCRIZIONE_ID);
    var folder = _getIscrizionePdfFolder_(data);
    var newFileName = "Iscrizione - " + data.cognome + " " + data.nome;
    var copyFile = docTemplate.makeCopy(newFileName, folder);
    var doc = DocumentApp.openById(copyFile.getId());
    var body = doc.getBody();

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
    _mirrorIscrizionePdfInRootFolder_(pdfFile, data);

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

    var annoQuota = new Date().getFullYear();
    try {
      _registraQuotaDaIscrizione_(ss, data, annoQuota);
    } catch (quotaErr) {
      Logger.log("[_registraQuotaDaIscrizione_] " + (quotaErr.message || quotaErr));
    }

    var pdfBlob = pdfFile.getAs(MimeType.PDF);
    _inviaEmailIscrizione_(data, pdfBlob);

    return { success: true, name: data.nome, pdfUrl: pdfFile.getUrl(), numeroSocio: numeroSocio };
  } catch (e) {
    Logger.log("ERRORE CRITICO: " + e.toString());
    throw new Error("Errore durante l'elaborazione: " + e.message);
  } finally {
    lock.releaseLock();
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
  if (op === "getFirmaPdfForView") {
    try {
      return createIscrizioneJsonOutput(getFirmaPdfForView());
    } catch (firmaErr) {
      return createIscrizioneJsonOutput({ success: false, message: firmaErr.message || String(firmaErr) });
    }
  }
  if (op === "getFirmaSignaturePositions") {
    return createIscrizioneJsonOutput(getFirmaSignaturePositions());
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

    if (bodyAction === "salvaAggiornamentoAssociatoIscrizione") {
      return createIscrizioneJsonOutput(salvaAggiornamentoAssociatoIscrizione(data));
    }

    if (bodyAction === "inviaIscrizione" || bodyAction === "inviaIscrizioneConPagamento") {
      var result = inviaIscrizioneConPagamento(data);
      return createIscrizioneJsonOutput(result);
    }

    if (bodyAction === "salvaFirmaDocumento") {
      try {
        return createIscrizioneJsonOutput(salvaFirmaDocumento(data.pdfBase64));
      } catch (firmaSaveErr) {
        return createIscrizioneJsonOutput({ success: false, message: firmaSaveErr.message || String(firmaSaveErr) });
      }
    }

    if (bodyAction === "inviaFirmaDocumentoAdmin") {
      try {
        return createIscrizioneJsonOutput(inviaFirmaDocumentoAdmin());
      } catch (firmaInviaErr) {
        return createIscrizioneJsonOutput({ success: false, message: firmaInviaErr.message || String(firmaInviaErr) });
      }
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
