/**
 * Firma digitale documento "Estensione Associazione MP.pdf"
 * Salvataggio su Drive (sovrascrittura) e invio email admin.
 */

var FIRMA_DOC_FOLDER_NAME = "Estensione Associazione";
var FIRMA_ORIGINAL_FILENAME = "Estensione Associazione MP.pdf";
var FIRMA_SIGNED_FILENAME = "Estensione Associazione MP - Firmato.pdf";
var FIRMA_SIGNATURE_COUNT_KEY = "FIRMA_DOC_SIGNATURE_COUNT";

function _getFirmaDocumentFolder_() {
  var root = DriveApp.getFolderById(ROOT_ISCRIZIONI_FOLDER_ID);
  return getOrCreateFolder(root, FIRMA_DOC_FOLDER_NAME);
}

function _findFileInFolder_(folder, fileName) {
  var files = folder.getFilesByName(fileName);
  return files.hasNext() ? files.next() : null;
}

function _findFileInFirmaFolder_(fileName) {
  var folder = _getFirmaDocumentFolder_();
  return _findFileInFolder_(folder, fileName);
}

function _getIscrizioniRootFolder_() {
  if (typeof ROOT_ISCRIZIONI_FOLDER_ID === "undefined" || !ROOT_ISCRIZIONI_FOLDER_ID) return null;
  return DriveApp.getFolderById(ROOT_ISCRIZIONI_FOLDER_ID);
}

/** Copia anche nella root Iscrizioni (accanto alle altre iscrizioni) per ritrovarlo facilmente. */
function _mirrorSignedPdfInIscrizioniRoot_(blob) {
  var rootFolder = _getIscrizioniRootFolder_();
  if (!rootFolder) return null;
  try {
    var existing = _findFileInFolder_(rootFolder, FIRMA_SIGNED_FILENAME);
    if (existing) {
      existing.setContent(blob.getBytes());
      existing.setMimeType("application/pdf");
      existing.setName(FIRMA_SIGNED_FILENAME);
      return existing;
    }
    return rootFolder.createFile(blob);
  } catch (e) {
    Logger.log("[_mirrorSignedPdfInIscrizioniRoot_] " + e.message);
    return null;
  }
}

function _upsertSignedPdf_(bytes) {
  var blob = Utilities.newBlob(bytes, "application/pdf", FIRMA_SIGNED_FILENAME);
  var existing = _findFileInFirmaFolder_(FIRMA_SIGNED_FILENAME);
  if (existing) {
    existing.setContent(bytes);
    existing.setMimeType("application/pdf");
    existing.setName(FIRMA_SIGNED_FILENAME);
  } else {
    existing = _getFirmaDocumentFolder_().createFile(blob);
  }
  _mirrorSignedPdfInIscrizioniRoot_(blob);
  return existing;
}

function _getSignedPdfDriveUrls_(signedFile) {
  var urls = {
    pdfUrl: signedFile ? signedFile.getUrl() : "",
    folderUrl: ""
  };
  try {
    var parents = signedFile.getParents();
    if (parents.hasNext()) urls.folderUrl = parents.next().getUrl();
  } catch (e) {}
  var rootFolder = _getIscrizioniRootFolder_();
  if (rootFolder) {
    var rootCopy = _findFileInFolder_(rootFolder, FIRMA_SIGNED_FILENAME);
    if (rootCopy) urls.rootCopyUrl = rootCopy.getUrl();
  }
  return urls;
}

function _ensureFirmaOriginalPdf_() {
  var existing = _findFileInFirmaFolder_(FIRMA_ORIGINAL_FILENAME);
  if (existing) return existing;

  var b64 = getFirmaPdfOriginaleBase64_();
  if (!b64) {
    throw new Error("PDF originale non disponibile. Contatta l'amministratore.");
  }
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), "application/pdf", FIRMA_ORIGINAL_FILENAME);
  return _getFirmaDocumentFolder_().createFile(blob);
}

function _getFirmaSignatureCount_() {
  var n = parseInt(PropertiesService.getScriptProperties().getProperty(FIRMA_SIGNATURE_COUNT_KEY) || "0", 10);
  return isNaN(n) ? 0 : n;
}

function _setFirmaSignatureCount_(n) {
  PropertiesService.getScriptProperties().setProperty(FIRMA_SIGNATURE_COUNT_KEY, String(Math.max(0, n)));
}

function _fileToBase64_(file) {
  return Utilities.base64Encode(file.getBlob().getBytes());
}

function _isValidPdfBytes_(bytes) {
  if (!bytes || bytes.length < 5) return false;
  var head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
  return head === "%PDF-";
}

function _readPdfBytes_(file) {
  return file.getBlob().getBytes();
}

function _discardInvalidFirmaFile_(file, reason) {
  if (!file) return;
  try {
    Logger.log("Rimozione file firma non valido (" + reason + "): " + file.getName());
    file.setTrashed(true);
  } catch (e) {
    Logger.log("Impossibile rimuovere file firma: " + e.message);
  }
}

function _getViewableFirmaFile_() {
  _ensureFirmaOriginalPdf_();
  var signed = _findFileInFirmaFolder_(FIRMA_SIGNED_FILENAME);
  if (signed) {
    var signedBytes = _readPdfBytes_(signed);
    if (_isValidPdfBytes_(signedBytes)) return { file: signed, hasSignedVersion: true };
    _discardInvalidFirmaFile_(signed, "PDF firmato corrotto");
  }

  var original = _findFileInFirmaFolder_(FIRMA_ORIGINAL_FILENAME);
  if (original) {
    var origBytes = _readPdfBytes_(original);
    if (_isValidPdfBytes_(origBytes)) return { file: original, hasSignedVersion: false };
    _discardInvalidFirmaFile_(original, "PDF originale corrotto");
  }

  original = _ensureFirmaOriginalPdf_();
  return { file: original, hasSignedVersion: false };
}

/**
 * Restituisce il PDF da visualizzare: versione firmata se esiste, altrimenti originale.
 */
function getFirmaPdfForView() {
  try {
    var view = _getViewableFirmaFile_();
    var file = view.file;
    if (!file) {
      throw new Error("Documento non trovato.");
    }
    var bytes = _readPdfBytes_(file);
    if (!_isValidPdfBytes_(bytes)) {
      throw new Error("Documento PDF non valido.");
    }
    return {
      success: true,
      pdfBase64: Utilities.base64Encode(bytes),
      hasSignedVersion: view.hasSignedVersion,
      signatureSlot: _getFirmaSignatureCount_(),
      fileName: file.getName(),
      pdfUrl: file.getUrl()
    };
  } catch (e) {
    Logger.log("getFirmaPdfForView: " + e.message);
    throw new Error(e.message || "Impossibile caricare il documento.");
  }
}

/**
 * Salva il PDF firmato (sovrascrive sempre lo stesso file).
 */
function salvaFirmaDocumento(pdfBase64) {
  if (!pdfBase64 || String(pdfBase64).length < 100) {
    throw new Error("Documento firmato non valido.");
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error("Operazione in corso, riprova tra poco.");
  }
  try {
    _ensureFirmaOriginalPdf_();
    var b64 = String(pdfBase64).replace(/^data:application\/pdf;base64,/, "");
    var bytes = Utilities.base64Decode(b64);
    if (!_isValidPdfBytes_(bytes)) {
      throw new Error("Il PDF firmato inviato non è valido.");
    }
    var blob = Utilities.newBlob(bytes, "application/pdf", FIRMA_SIGNED_FILENAME);
    var saved = _upsertSignedPdf_(bytes);
    var urls = _getSignedPdfDriveUrls_(saved);

    return {
      success: true,
      message: "Documento firmato salvato correttamente.",
      pdfUrl: urls.pdfUrl,
      rootCopyUrl: urls.rootCopyUrl || urls.pdfUrl
    };
  } catch (e) {
    Logger.log("salvaFirmaDocumento: " + e.message);
    throw new Error(e.message || "Errore durante il salvataggio.");
  } finally {
    lock.releaseLock();
  }
}

/**
 * Invia il documento firmato all'email amministratore.
 */
function inviaFirmaDocumentoAdmin() {
  var signed = _findFileInFirmaFolder_(FIRMA_SIGNED_FILENAME);
  if (!signed) {
    throw new Error("Nessun documento firmato da inviare. Salva prima la firma.");
  }

  _mirrorSignedPdfInIscrizioniRoot_(signed.getBlob());
  var urls = _getSignedPdfDriveUrls_(signed);
  var driveUrl = urls.rootCopyUrl || urls.pdfUrl;

  var adminEmail = (typeof ADMIN_EMAIL !== "undefined" && ADMIN_EMAIL)
    ? String(ADMIN_EMAIL).trim()
    : "";
  if (!adminEmail) {
    throw new Error("Email amministratore non configurata.");
  }

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  var plainBody =
    "In allegato il documento \"Estensione Associazione MP\" firmato digitalmente.\n\n" +
    "Inviato il " + today + ".\n\n" +
    "Puoi aprirlo anche su Google Drive:\n" + driveUrl + "\n\n" +
    "MusicPro Eventi";
  var htmlBody =
    "<p>In allegato il documento <strong>Estensione Associazione MP</strong> firmato digitalmente.</p>" +
    "<p>Inviato il " + today + ".</p>" +
    "<p><a href=\"" + driveUrl + "\">Apri il documento su Google Drive</a></p>" +
    "<p>MusicPro Eventi</p>";

  MailApp.sendEmail({
    to: adminEmail,
    subject: "Estensione Associazione MP — documento firmato",
    body: plainBody,
    htmlBody: htmlBody,
    attachments: [signed.getBlob()],
    name: "MusicPro Eventi"
  });

  return {
    success: true,
    message: "Documento inviato a " + adminEmail,
    pdfUrl: driveUrl
  };
}

/** Tre firme: base del riquadro sulla riga "firma ___" (y = baseline riga, pdf-lib dal basso). */
function getFirmaSignaturePositions() {
  return [
    { x: 338, y: 268, width: 230, height: 36, label: "Presidente — Mauro Andreoni" },
    { x: 338, y: 210, width: 230, height: 36, label: "Vice Presidente — Dario Sgueglia" },
    { x: 338, y: 152, width: 230, height: 36, label: "Consigliere — Andrea Garibaldi" }
  ];
}
