// --- IMPOSTAZIONI GLOBALI ---
// ID del Foglio Google che funge da database per l'app
const SPREADSHEET_ID = '1vwyCTqXJDe0IKr_tIH2Dgz5ewlTo-OCnTxH2WNSYAOU'; // Il tuo ID originale

// ID della cartella "madre" di tutti i rimborsi e report.
const ROOT_REIMBURSEMENTS_FOLDER_ID = '14PwoMNblwtzxzc9GTZQOsfTH7-r5tmZR';

// ID fisso del documento modello per i rimborsi individuali
const TEMPLATE_ID = '1CkjcoNEfsLzN6RcepBcMU65y5dkudO-DuWNS5mxPPCw';
// Nomi dei fogli di lavoro
const ASSOCIATES_SHEET_NAME = 'ASSOCIATI'; // Il foglio principale con i dati degli associati (ora con la struttura Rubrica)
const LOG_SHEET_NAME = 'NOTULE'; // Il foglio log per i rimborsi

const SETTINGS_SHEET_NAME = 'IMPOSTAZIONI_QUOTE'; //
const QUOTE_SHEET_NAME = 'QUOTE';
const ADMIN_EMAIL = 'musicproeventi@gmail.com'; // <-- MODIFICA QUI

// ID fisso del documento modello per il modulo d'iscrizione
const ISCRIZIONE_TEMPLATE_ID = '1CVxLAsEweuZD11N6V3CBkaNqegG6c2BeOT9WZLSw63I';

// ID della cartella "madre" di tutti i moduli d'iscrizione firmati.
const ROOT_ISCRIZIONI_FOLDER_ID = '1s9IxsGHytPFHuBhJWBBaUlX_iRdNXxo5';

const COL_INDEX = {
  NUMERO_ASSOCIATO: 0,        // Colonna A
  DATA_ISCRIZIONE: 1,         // Colonna B
  // QUOTA_COL: 2, is ignored
  NOME: 3,                    // Colonna D
  COGNOME: 4,                 // Colonna E
  LUOGO_NASCITA: 5,           // Colonna F
  PROVINCIA_NASCITA: 6,       // Colonna G (NUOVO)
  DATA_NASCITA: 7,            // Colonna H
  INDIRIZZO: 8,               // Colonna I (Via e Numero Civico)
  CAP: 9,                     // Colonna J (NUOVO)
  CITTA: 10,                  // Colonna K (NUOVO)
  PROVINCIA_RESIDENZA: 11,    // Colonna L (NUOVO)
  CODICE_FISCALE: 12,         // Colonna M
  TELEFONO: 13,               // Colonna N
  EMAIL: 14,                  // Colonna O
  NUMERO_TUTORE: 15,          // Colonna P
  NOME_COMPLETO_TUTORE: 16,   // Colonna Q
  TUTORE_NOME_MANUALE: 17,    // Colonna R
  TUTORE_COGNOME_MANUALE: 18, // Colonna S
  TUTORE_CELLULARE_MANUALE: 19,// Colonna T
  TUTORE_EMAIL_MANUALE: 20,   // Colonna U
  TUTORE_CF_MANUALE: 21,      // Colonna V
  TELEGRAM_CHAT_ID: 22,       // Colonna W
  CONSENSO_GDPR: 23           // Colonna X (NUOVO)
};

// La colonna di inizio per le quote annuali (S in poi)
const START_COL_QUOTE = 19; // Colonna S (indice 18 per array 0-based)

// --- Mappatura Colonne per il Foglio 'NOTULE' ---
const LOG_COL_INDEX = {
  ANNO: 0,          // Colonna A
  DATA_GENERAZIONE: 1,    // Colonna B
  PROGRESSIVO: 2,         // Colonna C
  IMPORTO_LORDO: 3,       // Colonna D
  RITENUTA: 4,            // Colonna E (Non più calcolata ma mantiene la colonna)
  IMPORTO_NETTO: 5,       // Colonna F (Non più calcolata ma mantiene la colonna)
  NOME_ASSOCIATO: 6,      // Colonna G
  URL_PDF: 7,             // Colonna H
  METODO_PAGAMENTO: 8,    // Colonna I
  DATA_PAGAMENTO: 9,      // Colonna J
  IMPORTO_RICEVUTE: 10,  // Colonna K (NUOVA)
  RICEVUTE: 11            // Colonna L (Spostata, ora rappresenta lo stato testuale)
};
const LOG_NUM_COLS = 12; // Colonne A–L da scrivere (evita di riscrivere URL in I–O)

// Timezone dello script (usato per formattazione date)
var scriptTimeZone = Session.getScriptTimeZone();

/**
 * @version 1.0 - Tenta di migrare i dati dalla vecchia colonna "Indirizzo".
 * @v_note Legge ogni riga, cerca di estrarre CAP, Città e Provincia dalla colonna
 * dell'indirizzo e scrive i dati nelle nuove colonne. Da eseguire manualmente una sola volta.
 */
function migrateAddressData() {
  Logger.log("migrateAddressData: Avvio migrazione dati indirizzi.");
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    "Conferma Migrazione Dati",
    "Questa operazione tenterà di suddividere i dati dalla colonna 'Indirizzo' nelle nuove colonne 'CAP', 'Città' e 'Prov. Residenza'. I dati originali nella colonna 'Indirizzo' verranno modificati. Si consiglia di fare un backup del foglio prima di procedere. Continuare?",
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    ui.alert("Migrazione annullata.");
    return;
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);
    if (sheet.getLastRow() < 2) {
      ui.alert("Nessun dato da migrare.");
      return;
    }

    const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
    const values = range.getValues();
    let processedCount = 0;

    const newValues = values.map(row => {
      const indirizzoCompleto = String(row[COL_INDEX.INDIRIZZO] || '').trim();
      if (!indirizzoCompleto) {
        return row; // Salta se la cella indirizzo è vuota
      }

      let via = indirizzoCompleto;
      let cap = '';
      let citta = '';
      let prov = '';

      // Cerca il CAP (5 cifre)
      const capMatch = via.match(/(\d{5})/);
      if (capMatch) {
        cap = capMatch[1];
        const capIndex = via.indexOf(cap);
        
        // Estrai la provincia (es. (GE))
        const provMatch = via.substring(capIndex).match(/\((.*?)\)/);
        if (provMatch) {
          prov = provMatch[1];
          const provIndex = via.indexOf(provMatch[0]);
          citta = via.substring(capIndex + 5, provIndex).trim().replace(/,/g, '');
        } else {
          citta = via.substring(capIndex + 5).trim().replace(/,/g, '');
        }
        
        via = via.substring(0, capIndex).trim().replace(/,$/, '').trim();
        processedCount++;
      }
      
      // Aggiorna i valori nella riga
      row[COL_INDEX.INDIRIZZO] = via;
      row[COL_INDEX.CAP] = cap;
      row[COL_INDEX.CITTA] = citta;
      row[COL_INDEX.PROVINCIA_RESIDENZA] = prov;

      return row;
    });
    
    // Riscrivi tutti i dati aggiornati nel foglio
    range.setValues(newValues);
    
    Logger.log(`Migrazione completata. Righe processate con successo: ${processedCount}.`);
    ui.alert(`Migrazione completata! Sono state processate ${processedCount} righe. Per favore, controlla manualmente i dati per eventuali imprecisioni.`);

  } catch (e) {
    Logger.log(`Errore in migrateAddressData: ${e.stack}`);
    ui.alert("Errore", `Si è verificato un errore durante la migrazione: ${e.message}`, ui.ButtonSet.OK);
  }
}

/**
 * @version 1.0 - Crea un menu personalizzato nell'interfaccia di Google Fogli.
 * @note Questa funzione viene eseguita automaticamente ogni volta che il foglio viene aperto.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Strumenti Associazione')
    .addItem('Aggiorna Struttura Foglio Associati', 'formatAssociatiSheet_v2')
    .addSeparator()
    .addItem('Migra Dati Indirizzi', 'migrateAddressData')
    .addToUi();
}

/**
 * @version 2.0 - Aggiorna la struttura del foglio 'ASSOCIATI'.
 * @v_note Riscrive la riga delle intestazioni per aggiungere le nuove colonne
 * (Prov. Nascita, CAP, Città, Prov. Residenza, Consenso GDPR) senza cancellare i dati.
 * Da eseguire manualmente una sola volta.
 */
function formatAssociatiSheet_v2() {
  try {
    Logger.log("formatAssociatiSheet_v2: Avvio aggiornamento struttura foglio 'ASSOCIATI'.");
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);

    if (!sheet) {
      throw new Error(`Errore: Foglio "${ASSOCIATES_SHEET_NAME}" non trovato.`);
    }

    // Definisce l'elenco esatto e finale delle intestazioni nell'ordine corretto.
    const finalHeaders = [
      "Numero", "Data Iscrizione", "Quota", "Nome", "Cognome", 
      "Luogo Nascita", "Prov. Nascita", "Data Nascita", "Indirizzo", "CAP", "Città", "Prov. Residenza",
      "Codice Fiscale", "Cellulare", "Email",
      "Numero Tutore", "Nome Completo Tutore", "Tutore Nome", "Tutore Cognome",
      "Tutore Cellulare", "Tutore Email", "Tutore Codice Fiscale",
      "Telegram Chat ID", "Consenso GDPR"
    ];

    // Scrive la riga completa delle intestazioni sulla prima riga del foglio.
    // Questo aggiungerà le nuove colonne se non esistono e correggerà l'ordine.
    sheet.getRange(1, 1, 1, finalHeaders.length).setValues([finalHeaders]).setFontWeight("bold");
    
    SpreadsheetApp.flush();
    Logger.log("✅ Struttura del foglio 'ASSOCIATI' aggiornata con successo.");
    
    // Mostra un messaggio di conferma nell'interfaccia di Google Sheets (se aperta)
    SpreadsheetApp.getUi().alert("Operazione completata!", "La struttura del foglio 'ASSOCIATI' è stata aggiornata con le nuove colonne.", SpreadsheetApp.getUi().ButtonSet.OK);

  } catch (e) {
    Logger.log(`Errore in formatAssociatiSheet_v2: ${e.stack}`);
    SpreadsheetApp.getUi().alert("Errore", `Impossibile aggiornare la struttura del foglio: ${e.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Formatta il foglio 'NOTULE' con le intestazioni e i formati di colonna corretti.
 * Se il foglio non esiste, viene creato.
 */
function formatNotuleSheet() {
  Logger.log("formatNotuleSheet: Inizio formattazione foglio 'NOTULE'.");
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(LOG_SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(LOG_SHEET_NAME);
      Logger.log(`formatNotuleSheet: Foglio "${LOG_SHEET_NAME}" non trovato, creato nuovo foglio.`);
    }

    // CONTROLLO DI SICUREZZA: Esegui la formattazione solo se il foglio è vuoto.
    if (sheet.getLastRow() > 0) {
      Logger.log("formatNotuleSheet: Il foglio 'NOTULE' contiene già dati. Formattazione intestazioni saltata per sicurezza.");
      return; // Esce dalla funzione per non cancellare nulla
    }

    const headers = [
      "Anno", "Data Generazione", "Progressivo", "Importo Lordo", "Ritenuta",
      "Importo Netto", "Nome Associato", "URL PDF", "Metodo Pagamento",
      "Data Pagamento", "Ricevute"
    ];

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    Logger.log("formatNotuleSheet: Intestazioni impostate per 'NOTULE'.");

    const maxRows = sheet.getMaxRows();
    sheet.getRange(2, LOG_COL_INDEX.DATA_GENERAZIONE + 1, maxRows - 1, 1).setNumberFormat("dd/MM/yyyy");
    sheet.getRange(2, LOG_COL_INDEX.DATA_PAGAMENTO + 1, maxRows - 1, 1).setNumberFormat("dd/MM/yyyy");
    sheet.getRange(2, LOG_COL_INDEX.IMPORTO_LORDO + 1, maxRows - 1, 1).setNumberFormat('€ #,##0.00');
    sheet.getRange(2, LOG_COL_INDEX.RITENUTA + 1, maxRows - 1, 1).setNumberFormat('€ #,##0.00');
    sheet.getRange(2, LOG_COL_INDEX.IMPORTO_NETTO + 1, maxRows - 1, 1).setNumberFormat('€ #,##0.00');
    
    sheet.autoResizeColumns(1, headers.length);
    Logger.log("Foglio 'NOTULE' formattato con successo.");

  } catch (e) {
    Logger.log("Errore durante la formattazione del foglio NOTULE: " + e.stack);
    throw new Error("Si è verificato un errore durante la formattazione: " + e.message);
  }
}


// --- Funzioni comuni / Helper ---

/** Info deploy mostrata nell'header dell'app (aggiornare a ogni release). */
var DEPLOY_INFO = {
  version: '1.1.0',
  date: '2026-06-11',
  description: 'Stripe ritorno iscrizione'
};

/**
 * @version 2.6 - Funzione doGet Unificata
 * @v_note Gestisce Login, Area Personale, Iscrizione e Dashboard Admin.
 */
function doGet(e) {
  Logger.log("doGet: Richiesta ricevuta con parametri: " + JSON.stringify(e.parameter));

  if (e && e.parameter && String(e.parameter.action || "").trim() === "api") {
    return handleIscrizioneApiGet_(e);
  }

  // Se non ci sono parametri, e.parameter potrebbe essere undefined
  const page = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'default';

  switch (page) {
    case 'login':
      Logger.log("doGet: Servo la pagina di login.");
      return HtmlService.createTemplateFromFile('login')
        .evaluate()
        .setTitle('Accesso Area Associato')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');

    case 'area-personale':
      Logger.log("doGet: Servo la pagina dell'area personale.");
      const templateArea = HtmlService.createTemplateFromFile('area-personale');
      templateArea.token = e.parameter.token || null;
      return templateArea.evaluate()
        .setTitle('Area Personale Associato')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');

    case 'iscrizione':
      Logger.log("doGet: Servo il modulo di iscrizione.");
      return HtmlService.createTemplateFromFile('iscrizione')
        .evaluate()
        .setTitle('Iscrizione MusicPro') // Titolo pulito senza anno
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');

    case 'conferma-pagamento':
      Logger.log("doGet: Servo la pagina di conferma pagamento.");
      return HtmlService.createTemplateFromFile('conferma-pagamento')
        .evaluate()
        .setTitle('Conferma Pagamento — MusicPro')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');

    default:
      Logger.log("doGet: Servo la pagina di gestione principale (index).");
      var templateIndex = HtmlService.createTemplateFromFile('index');
      templateIndex.deployVersion = DEPLOY_INFO.version;
      templateIndex.deployDate = DEPLOY_INFO.date;
      templateIndex.deployDescription = DEPLOY_INFO.description;
      return templateIndex.evaluate()
        .setTitle('Gestione Associati e Rimborsi')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
}

/**
 * Funzione di supporto per trovare o creare una cartella.
 */
function getOrCreateFolder(parentFolder, folderName) {
  Logger.log(`getOrCreateFolder: Cercando/creando cartella "${folderName}" in "${parentFolder.getName()}".`);
  const folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    Logger.log(`getOrCreateFolder: Cartella "${folderName}" trovata.`);
    return folders.next();
  } else {
    Logger.log(`getOrCreateFolder: Cartella "${folderName}" non trovata, creazione in corso.`);
    return parentFolder.createFolder(folderName);
  }
}


/** Formatta Date object o stringa/numero data in YYYY-MM-DD per input type=date */
function formatDateForInput(dateValue){
  try {
    if(dateValue instanceof Date && !isNaN(dateValue)){
      return Utilities.formatDate(dateValue, scriptTimeZone, "yyyy-MM-dd");
    }
    if(dateValue && (typeof dateValue === 'string' || typeof dateValue === 'number')){
        let potentialDate = null;
        if(typeof dateValue === 'number' && dateValue > 25569 && dateValue < 60000) { // Range plausibile per numeri seriali data Excel/Sheets
            const excelEpochDiff = 25569;
            const utcMillis = (dateValue - excelEpochDiff) * 86400 * 1000;
            potentialDate = new Date(utcMillis);
        } else {
            potentialDate = new Date(dateValue);
        }
        if(potentialDate && potentialDate instanceof Date && !isNaN(potentialDate)){
            return Utilities.formatDate(potentialDate, scriptTimeZone, "yyyy-MM-dd");
        }
    }
    return "";
  } catch(e){
    Logger.log(`Helper formatDateForInput Errore: ${e} per valore ${dateValue}`); // Changed to Logger.log
    return "";
  }
}

function generateMultipleDocuments(optionsArray) {
  Logger.log(`generateMultipleDocuments: Ricevuti ${optionsArray.length} rimborsi da generare.`);
  let successCount = 0;
  let errorMessages = [];

  optionsArray.forEach((options, index) => {
    try {
      generateDocument({ ...options, skipOrganize: true }); // Nessuna organizzazione dopo ogni doc; si fa una sola volta in fondo
      successCount++;
    } catch (e) {
      Logger.log(`Errore durante la generazione del rimborso #${index + 1} (${options.associateName}): ${e.message}`);
      errorMessages.push(`Associato ${options.associateName}: ${e.message}`);
    }
  });

  if (successCount > 0) {
    try {
      organizeNotuleSheet(); // Una sola volta a fine batch: ordina, separatori, rimuove righe vuote
      Logger.log('generateMultipleDocuments: Foglio NOTULE organizzato a fine batch.');
    } catch (orgErr) {
      Logger.log(`generateMultipleDocuments: organizeNotuleSheet a fine batch non eseguito: ${orgErr.message}`);
    }
  }

  if (errorMessages.length > 0) {
    throw new Error(`Generati ${successCount} rimborsi. Errori: ${errorMessages.join(', ')}`);
  }

  return { message: `Generati con successo ${successCount} rimborsi.` };
}

/** Parsa una stringa YYYY-MM-DD (da input type=date) in un oggetto Date JavaScript o null */
function parseDateFromInput(dateStringYMD){
  if(dateStringYMD && typeof dateStringYMD === 'string' && dateStringYMD.match(/^\d{4}-\d{2}-\d{2}$/)){
    try {
      const parts = dateStringYMD.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      const dateObj = new Date(Date.UTC(year, month - 1, day));
      if(!isNaN(dateObj) && dateObj.getUTCFullYear() === year && dateObj.getUTCMonth() === month - 1 && dateObj.getUTCDate() === day)
      {
          return dateObj;
      }
    } catch(e){
      Logger.log(`Errore parsing data input ${dateStringYMD}: ${e}`); // Changed to Logger.log
    }
  }
  return null;
}

/** Formatta un oggetto Date in stringa DD/MM/YYYY per display o scrittura (se necessario) */
function formatDateForDisplay(dateValue) {
  if (!dateValue || !(dateValue instanceof Date) || isNaN(dateValue.getTime())) return "";
  try {
      return Utilities.formatDate(dateValue, scriptTimeZone, "dd/MM/yyyy");
  } catch (e) {
    Logger.log(`Errore formatDateForDisplay per data ${dateValue}: ${e}`); // Changed to Logger.log
    return "ERR_FMT";
  }
}

/** Logga la struttura di un oggetto in modo sicuro. */
function logObjectStructure(obj, objName="Oggetto"){
  if(obj === null){ Logger.log(`${objName}: null`); return; }
  if(obj === undefined){ Logger.log(`${objName}: undefined`); return; }
  if(typeof obj !== 'object'){ Logger.log(`${objName}: (${typeof obj}) ${obj}`); return; }
  if(Array.isArray(obj)){ Logger.log(`${objName}: Array[${obj.length}]`); return; }
  try {
    Logger.log(`${objName}: ${JSON.stringify(obj)}`);
  }
  catch(e){
    Logger.log(`${objName}: Impossibile usare JSON.stringify. Chiavi: ${Object.keys(obj).join(', ')}`);
  }
}


/**
 * Recupera tutti i dati iniziali necessari per la web app (lista associati e anni).
 */
function getInitialData() {
  Logger.log("getInitialData: Inizio recupero dati iniziali.");
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const associatesSheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);
    const logSheet = ss.getSheetByName(LOG_SHEET_NAME);

    if (!associatesSheet) {
      Logger.log(`getInitialData: Foglio "${ASSOCIATES_SHEET_NAME}" non trovato.`); // Changed to Logger.log
      throw new Error(`Foglio "${ASSOCIATES_SHEET_NAME}" non trovato. Assicurati che esista e il nome sia corretto.`);
    }
    if (!logSheet) {
      Logger.log(`getInitialData: Foglio "${LOG_SHEET_NAME}" non trovato.`); // Changed to Logger.log
      throw new Error(`Foglio "${LOG_SHEET_NAME}" non trovato. Assicurati che esista e il nome sia corretto.`);
    }

    let associates = [];
    if (associatesSheet.getLastRow() >= 2) {
      const associatesData = associatesSheet.getRange(2, 1, associatesSheet.getLastRow() - 1, Math.max(COL_INDEX.NOME + 1, COL_INDEX.COGNOME + 1)).getValues();
      associates = associatesData.map((row, index) => {
        const nome = row[COL_INDEX.NOME] || "";
        const cognome = row[COL_INDEX.COGNOME] || "";
        if (!nome && !cognome) return null;
        return { name: `${nome} ${cognome}`.trim(), rowNumber: index + 2 };
      }).filter(Boolean);
      Logger.log(`getInitialData: Trovati ${associates.length} associati.`);
    } else {
      Logger.log("getInitialData: Nessun associato trovato (foglio ASSOCIATI vuoto o solo header).");
    }

    let logYears = [];
    if (logSheet.getLastRow() > 1) {
      const yearData = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 1).getValues();
      logYears = yearData.flat().map(year => String(year).trim()).filter(Boolean);
      Logger.log(`getInitialData: Trovati ${logYears.length} anni nel log.`);
    } else {
      Logger.log("getInitialData: Nessun anno trovato nel log (foglio NOTULE vuoto o solo header).");
    }

    const currentYear = new Date().getFullYear().toString();
    if (!logYears.includes(currentYear)) {
      logYears.push(currentYear);
      Logger.log(`getInitialData: Aggiunto anno corrente (${currentYear}) alla lista degli anni.`);
    }
    const uniqueYears = [...new Set(logYears)].sort((a, b) => b - a);
    Logger.log(`getInitialData: Dati iniziali recuperati con successo.`);
    return { associates: associates, years: uniqueYears, currentYear: currentYear };
  } catch (e) {
    Logger.log('getInitialData Error: ' + e.stack); // Changed to Logger.log
    throw new Error('Impossibile caricare i dati iniziali. Controlla l\'ID dello Spreadsheet e i nomi dei fogli: ' + e.message);
  }
}

// --- Funzioni per la gestione delle Quote Associative (nel foglio IMPOSTAZIONI_QUOTE) ---

/**
 * Recupera tutte le impostazioni delle quote associative.
 * Se il foglio non esiste, lo crea con le intestazioni.
 * @returns {Array<Object>} Un array di oggetti {year: number, amount: number}, ordinato per anno decrescente.
 */
function getQuotaSettings() {
    Logger.log("getQuotaSettings: Inizio recupero impostazioni quote.");
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);

    if (!sheet) {
        Logger.log(`getQuotaSettings: Foglio "${SETTINGS_SHEET_NAME}" non trovato, creazione in corso.`); // Changed to Logger.log
        sheet = ss.insertSheet(SETTINGS_SHEET_NAME);
        sheet.appendRow(['Anno', 'Importo']).getRange("A1:B1").setFontWeight("bold");
        SpreadsheetApp.flush();
        return [];
    }

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      Logger.log("getQuotaSettings: Foglio impostazioni quote vuoto o solo intestazioni.");
      return [];
    }

    const settings = [];
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const year = parseInt(row[0]);
        const amount = parseFloat(row[1]);
        if (!isNaN(year) && !isNaN(amount)) {
            settings.push({ year: year, amount: amount });
        }
    }
    Logger.log(`getQuotaSettings: Trovate ${settings.length} impostazioni quote.`);
    return settings.sort((a, b) => b.year - a.year);
}

/**
 * Aggiunge una nuova impostazione di quota al foglio.
 */
function addQuotaSetting(year, amount) {
    Logger.log(`addQuotaSetting: Richiesta aggiunta quota Anno: ${year}, Importo: ${amount}.`);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
    if (!sheet) {
      Logger.log(`addQuotaSetting: Foglio "${SETTINGS_SHEET_NAME}" non trovato.`); // Changed to Logger.log
      throw new Error(`Foglio "${SETTINGS_SHEET_NAME}" non trovato.`);
    }

    const existingSettings = getQuotaSettings();
    if (existingSettings.some(setting => setting.year === year)) {
      Logger.log(`addQuotaSetting: La quota per l'anno ${year} esiste già.`); // Changed to Logger.log
      throw new Error(`La quota per l'anno ${year} esiste già.`);
    }

    sheet.appendRow([year, amount]);
    Logger.log(`addQuotaSetting: Quota per anno ${year} aggiunta con successo.`);
}

/**
 * Aggiorna un'impostazione di quota esistente.
 */
function updateQuotaSetting(originalYear, newYear, newAmount) {
    Logger.log(`updateQuotaSetting: Richiesta aggiornamento quota da Anno ${originalYear} a ${newYear}, Importo ${newAmount}.`);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
    if (!sheet) {
      Logger.log(`updateQuotaSetting: Foglio "${SETTINGS_SHEET_NAME}" non trovato.`); // Changed to Logger.log
      throw new Error(`Foglio "${SETTINGS_SHEET_NAME}" non trovato.`);
    }

    const data = sheet.getDataRange().getValues();
    const yearColIndex = 0; 
    const amountColIndex = 1; 

    let foundRowIndex = -1;
    for (let i = 1; i < data.length; i++) {
        if (parseInt(data[i][yearColIndex]) === originalYear) {
            foundRowIndex = i;
            break;
        }
    }

    if (foundRowIndex !== -1) {
        if (originalYear !== newYear) {
            for (let i = 1; i < data.length; i++) {
                if (i !== foundRowIndex && parseInt(data[i][yearColIndex]) === newYear) {
                  Logger.log(`updateQuotaSetting: L'anno ${newYear} esiste già per un'altra quota.`); // Changed to Logger.log
                  throw new Error(`L'anno ${newYear} esiste già per un'altra quota.`);
                }
            }
        }
        sheet.getRange(foundRowIndex + 1, yearColIndex + 1).setValue(newYear);
        sheet.getRange(foundRowIndex + 1, amountColIndex + 1).setValue(newAmount);
        Logger.log(`updateQuotaSetting: Quota per anno ${originalYear} aggiornata con successo.`);
    } else {
        Logger.log(`updateQuotaSetting: Quota per l'anno ${originalYear} non trovata.`); // Changed to Logger.log
        throw new Error(`Quota per l'anno ${originalYear} non trovata.`);
    }
}

/**
 * Elimina un'impostazione di quota per un dato anno.
 */
function deleteQuotaSetting(year) {
    Logger.log(`deleteQuotaSetting: Richiesta eliminazione quota per anno ${year}.`);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
    if (!sheet) {
      Logger.log(`deleteQuotaSetting: Foglio "${SETTINGS_SHEET_NAME}" non trovato.`); // Changed to Logger.log
      throw new Error(`Foglio "${SETTINGS_SHEET_NAME}" non trovato.`);
    }

    const data = sheet.getDataRange().getValues();
    const yearColIndex = 0; 

    let rowIndexToDelete = -1;
    for (let i = 1; i < data.length; i++) {
        if (parseInt(data[i][yearColIndex]) === year) {
            rowIndexToDelete = i;
            break;
        }
    }

    if (rowIndexToDelete !== -1) {
        sheet.deleteRow(rowIndexToDelete + 1);
        Logger.log(`deleteQuotaSetting: Quota per anno ${year} eliminata con successo.`);
    } else {
        Logger.log(`deleteQuotaSetting: Quota per l'anno ${year} non trovata.`); // Changed to Logger.log
        throw new Error(`Quota per l'anno ${year} non trovata.`);
    }
}

function getDrivePathSettings() {
    Logger.log("getDrivePathSettings: Inizio recupero impostazioni Drive.");
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
    const settings = {};
    
    settings['ROOT_REIMBURSEMENTS_FOLDER_ID'] = ROOT_REIMBURSEMENTS_FOLDER_ID;
    settings['ASSOCIATES_BOOK_FOLDER_ID'] = ROOT_REIMBURSEMENTS_FOLDER_ID; 

    if (sheet) {
        const data = sheet.getDataRange().getValues();
        for (let i = 0; i < data.length; i++) {
            const key = String(data[i][0]).trim();
            const value = String(data[i][1]).trim();
            if (key === 'ROOT_REIMBURSEMENTS_FOLDER_ID' && value) {
                settings[key] = value;
            }
            if (key === 'ASSOCIATES_BOOK_FOLDER_ID' && value) {
                settings[key] = value;
            }
        }
    }
    Logger.log("getDrivePathSettings: Impostazioni Drive recuperate.");
    return settings;
}


/**
 * Aggiorna un'impostazione di percorso di una cartella Drive.
 */
function updateDrivePathSetting(key, value) {
    Logger.log(`updateDrivePathSetting: Aggiornamento impostazione Drive: Chiave "${key}", Valore "${value}".`);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
    if (!sheet) {
      Logger.log(`updateDrivePathSetting: Foglio "${SETTINGS_SHEET_NAME}" non trovato.`); // Changed to Logger.log
      throw new Error(`Foglio "${SETTINGS_SHEET_NAME}" non trovato.`);
    }

    const data = sheet.getDataRange().getValues();
    let found = false;
    for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === key) {
            sheet.getRange(i + 1, 2).setValue(value);
            found = true;
            break;
        }
    }

    if (!found) {
        sheet.appendRow([key, value]);
        Logger.log(`updateDrivePathSetting: Impostazione "${key}" aggiunta.`);
    } else {
        Logger.log(`updateDrivePathSetting: Impostazione "${key}" aggiornata.`);
    }
}

/**
 * [MANUALE QUOTA IN BLOCCO] Recupera i dati iniziali per il form di registrazione manuale in blocco.
 */
function getBulkQuotaInitialData() {
  Logger.log("getBulkQuotaInitialData: Inizio recupero dati per quote manuali in blocco.");
  try {
    const associatesMinimal = getAssociati(); 
    const quotaSettings = getQuotaSettings();
    
    const associatesForDropdown = associatesMinimal.map(a => ({ 
        name: `${a.nome} ${a.cognome}`,
        number: a.numero
    })).sort((a, b) => a.name.localeCompare(b.name));

    Logger.log(`getBulkQuotaInitialData: Trovati ${associatesForDropdown.length} associati e ${quotaSettings.length} impostazioni quote.`);
    return {
      associates: associatesForDropdown,
      quotaSettings: quotaSettings
    };
  } catch (e) {
    Logger.log("Errore in getBulkQuotaInitialData: " + e.stack); // Changed to Logger.log
    throw new Error("Impossibile caricare i dati per la registrazione delle quote: " + e.message);
  }
}

/**
 * Salva un array di pagamenti di quote nel foglio 'QUOTE'.
 * Se un pagamento per un associato in un dato anno esiste già, lo aggiorna (upsert).
 * Altrimenti, crea una nuova riga.
 * @param {Array<Object>} data Un array di oggetti, ciascuno con { associateName, year, paymentDate }.
 * @returns {object} Un oggetto che indica il successo dell'operazione.
 */
function saveBulkQuotas(data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const quoteSheet = ss.getSheetByName(QUOTE_SHEET_NAME);
    
    // 1. Legge tutti i dati esistenti una sola volta per efficienza
    const quoteData = quoteSheet.getDataRange().getValues();
    const quotaSettings = getQuotaSettings();

    // 2. Itera su ogni nuovo pagamento ricevuto dall'interfaccia
    data.forEach(payment => {
      const { associateName, year, paymentDate } = payment;
      if (!associateName) return; // Salta le righe senza un associato selezionato

      let existingRowIndex = -1;
      // Cerca se esiste già una riga per questo associato e anno
      for (let i = 1; i < quoteData.length; i++) { // Parte da 1 per saltare l'intestazione
        if (quoteData[i][0] === associateName && quoteData[i][1].toString() === year) {
          existingRowIndex = i + 1; // Le righe del foglio sono 1-based
          break;
        }
      }
      
      const dateObject = parseDateFromInput(paymentDate);
      const amount = (quotaSettings.find(s => s.year.toString() === year) || {}).amount || 0;

      if (dateObject) {
        if (existingRowIndex > -1) {
          // 3a. Se la riga esiste, AGGIORNA la data e l'importo
          quoteSheet.getRange(existingRowIndex, 3).setValue(dateObject); // Colonna C: Data Pagamento
          quoteSheet.getRange(existingRowIndex, 4).setValue(amount);     // Colonna D: Importo Pagato
        } else {
          // 3b. Se la riga non esiste, AGGIUNGI una nuova riga
          const newRow = [associateName, year, dateObject, amount];
          quoteSheet.appendRow(newRow);
          // Aggiungiamo la nuova riga ai dati letti per evitare di reinserirla se presente più volte nell'input
          quoteData.push(newRow); 
        }
      }
    });

    return { success: true, message: `Salvataggio di ${data.length} quote completato.` };

  } catch (e) {
    Logger.log(`Errore GRAVE in saveBulkQuotas: ${e.stack}`);
    throw new Error(`Impossibile salvare le quote: ${e.message}`);
  }
}

/**
 * @version 2.0 - Gestione Dare/Avere completo.
 * @v_note Ora restituisce il saldo REALE, anche se negativo.
 * Positivo = L'associato ha credito (più scontrini che soldi).
 * Negativo = L'associato ha debito (più soldi presi che scontrini dati).
 */
function getAssociateReceiptsSurplus(associateName) {
  Logger.log(`getAssociateReceiptsSurplus: Calcolo saldo per "${associateName}".`);
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logSheet = ss.getSheetByName(LOG_SHEET_NAME);
    
    // Se il foglio non esiste o è vuoto, non c'è storico, quindi surplus 0
    if (!logSheet || logSheet.getLastRow() < 2) {
      return 0;
    }

    const data = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, logSheet.getLastColumn()).getValues();
    let totalReimbursed = 0;
    let totalReceipts = 0;

    const targetName = String(associateName).trim().toLowerCase();

    data.forEach(row => {
      const rowName = String(row[LOG_COL_INDEX.NOME_ASSOCIATO] || '').trim().toLowerCase();
      
      // Considera solo le righe dell'associato specifico
      if (rowName === targetName) {
        const gross = parseFloat(row[LOG_COL_INDEX.IMPORTO_LORDO]) || 0;
        const receiptsVal = row[LOG_COL_INDEX.IMPORTO_RICEVUTE];
        
        // Logica di retro-compatibilità:
        // Se la cella "Importo Ricevute" è vuota o non è un numero (vecchi dati),
        // assumiamo che le ricevute fossero pari all'importo rimborsato (nessun surplus/deficit).
        const receipts = (receiptsVal === "" || isNaN(parseFloat(receiptsVal))) ? gross : parseFloat(receiptsVal);

        totalReimbursed += gross;
        totalReceipts += receipts;
      }
    });

    // Il saldo è la differenza tra quanto documentato (ricevute) e quanto rimborsato
    const balance = totalReceipts - totalReimbursed;
    
    // Arrotonda a 2 decimali per evitare errori di virgola mobile e restituisce il valore con segno
    return Math.round(balance * 100) / 100;

  } catch (e) {
    Logger.log(`Errore in getAssociateReceiptsSurplus: ${e.stack}`);
    return 0; // In caso di errore, per sicurezza ritorniamo 0
  }
}

/**
 * Funzione principale per generare il documento PDF di rimborso.
 * GESTISCE PAGAMENTI MULTIPLI, IMPORTO RICEVUTE E LOGICA DARE/AVERE.
 * ROBUSTO: scrive prima la riga nel NOTULE, poi genera il PDF e aggiorna l'URL.
 * Progressivo = MAX(progressivo già presenti) + 1 (gestisce eventuali buchi).
 * @version 1.4 - Prima NOTULE, poi PDF; progressivo con MAX+1.
 */
function generateDocument(options) {
  Logger.log("generateDocument: Inizio generazione documento con opzioni: " + JSON.stringify(options));
  try {
    const { associateName, amount, year, sendEmail, paymentParts, paymentDate, receiptsAmount } = options;

    if (!associateName || !amount || !year || !paymentParts || paymentParts.length === 0 || !paymentDate || typeof receiptsAmount === 'undefined') {
      Logger.log("generateDocument: Dati obbligatori mancanti.");
      throw new Error("Dati mancanti. Assicurati di aver compilato tutti i campi.");
    }

    // 1. Calcoli numerici
    const numericAmount = parseFloat(amount);
    const numericReceipts = parseFloat(receiptsAmount);
    const delta = numericAmount - numericReceipts;

    const historicBalance = getAssociateReceiptsSurplus(associateName);

    let receiptsTextLine = `Importo consegnato: € ${numericReceipts.toFixed(2).replace('.', ',')}`;
    if (delta > 0.01) {
      if (historicBalance >= (delta - 0.01)) {
        receiptsTextLine += `\nScontrini precedentemente ricevuti: € ${delta.toFixed(2).replace('.', ',')}`;
      } else {
        receiptsTextLine += `\nRicevute ancora da consegnare (anticipo): € ${delta.toFixed(2).replace('.', ',')}`;
      }
    } else if (delta < -0.01) {
      const surplusGenerated = Math.abs(delta);
      receiptsTextLine += `\nEccedenza a credito per prossimi rimborsi: € ${surplusGenerated.toFixed(2).replace('.', ',')}`;
    }

    const paymentMethodString = paymentParts
      .map(part => `${part.method}: € ${part.amount.toFixed(2)}`)
      .join(', ');

    const rootFolder = DriveApp.getFolderById(ROOT_REIMBURSEMENTS_FOLDER_ID);
    const yearFolder = getOrCreateFolder(rootFolder, `Rimborsi ${year}`);
    const lastName = associateName.split(' ').pop();
    const associateFolder = getOrCreateFolder(yearFolder, lastName);
    Logger.log(`generateDocument: Cartelle Drive preparate.`);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logSheet = ss.getSheetByName(LOG_SHEET_NAME);
    const associatesSheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);

    if (!logSheet || !associatesSheet) {
      throw new Error(`Fogli non trovati.`);
    }

    const logData = logSheet.getDataRange().getValues();
    const normalizedSearch = normalizeNameForCompare(associateName);
    const yearStr = String(year).trim();
    let maxProgressive = 0;
    logData.forEach(function(row) {
      const loggedYear = String(row[LOG_COL_INDEX.ANNO] || '').trim();
      const loggedName = String(row[LOG_COL_INDEX.NOME_ASSOCIATO] || '').trim();
      const grossAmount = parseFloat(row[LOG_COL_INDEX.IMPORTO_LORDO]) || 0;
      if (loggedYear !== yearStr) return;
      if (normalizeNameForCompare(loggedName) !== normalizedSearch) return;
      if (!loggedName || grossAmount <= 0) return;
      const prog = parseInt(String(row[LOG_COL_INDEX.PROGRESSIVO] || '0').replace(/\D/g, ''), 10) || 0;
      if (prog > maxProgressive) maxProgressive = prog;
    });
    const nextProgressive = maxProgressive + 1;
    const progressiveNumberStr = ('0' + nextProgressive).slice(-2);
    const today = new Date();

    // --- Prima NOTULE (URL vuoto), poi PDF; così non restano PDF orfani ---
    const urlPdfPlaceholder = '';
    logSheet.appendRow([
      year,
      today,
      progressiveNumberStr,
      numericAmount,
      numericAmount,
      numericAmount,
      associateName,
      urlPdfPlaceholder,
      paymentMethodString,
      parseDateFromInput(paymentDate),
      numericReceipts,
      ""
    ]);
    SpreadsheetApp.flush(); // Assicura che la riga sia persistita prima di procedere
    const appendedRowIndex = logSheet.getLastRow();
    Logger.log(`generateDocument: Riga NOTULE scritta alla riga ${appendedRowIndex}. Generazione PDF in corso...`);

    const templateFile = DriveApp.getFileById(TEMPLATE_ID);
    if (!templateFile) throw new Error(`Template non trovato.`);

    const newFileName = `${progressiveNumberStr}-${year} - ${associateName}`;
    const newFile = templateFile.makeCopy(newFileName, associateFolder);
    const doc = DocumentApp.openById(newFile.getId());
    const body = doc.getBody();

    const formattedDate = Utilities.formatDate(today, scriptTimeZone, 'dd/MM/yyyy');
    const dateParts = paymentDate.split('-');
    const formattedPaymentDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

    body.replaceText('{{NUMERO_DOCUMENTO}}', `${progressiveNumberStr}/${year}`);
    body.replaceText('{{NOME_COGNOME}}', associateName);
    body.replaceText('{{DATA}}', formattedDate);
    body.replaceText('{{IMPORTO}}', numericAmount.toFixed(2));
    body.replaceText('{{NETTO}}', numericAmount.toFixed(2));
    body.replaceText('{{MODALITA_PAGAMENTO}}', paymentMethodString);
    body.replaceText('{{DATA_PAGAMENTO}}', formattedPaymentDate);
    body.replaceText('{{RICEVUTE}}', receiptsTextLine);

    const associateData = associatesSheet.getDataRange().getValues();
    const associateRow = associateData.find(row => `${row[COL_INDEX.NOME]} ${row[COL_INDEX.COGNOME]}`.trim() === associateName.trim());
    let associateEmail = '';

    if (associateRow) {
      associateEmail = associateRow[COL_INDEX.EMAIL] || '';
      body.replaceText(`{{INDIRIZZO}}`, associateRow[COL_INDEX.INDIRIZZO] || '');
      body.replaceText(`{{COD. FISCALE}}`, associateRow[COL_INDEX.CODICE_FISCALE] || '');
    } else {
      body.replaceText(`{{INDIRIZZO}}`, '');
      body.replaceText(`{{COD. FISCALE}}`, '');
    }

    doc.saveAndClose();

    const pdfFile = newFile.getAs('application/pdf');
    const savedPdf = associateFolder.createFile(pdfFile).setName(newFile.getName() + ".pdf");
    DriveApp.getFileById(newFile.getId()).setTrashed(true);

    // getRange(row, column, numRows, numColumns): 1 riga, 1 colonna = solo cella H
    logSheet.getRange(appendedRowIndex, LOG_COL_INDEX.URL_PDF + 1, 1, 1)
      .setValue(savedPdf.getUrl());
    SpreadsheetApp.flush(); // Assicura che l'URL sia persistito nel foglio NOTULE
    Logger.log(`generateDocument: URL PDF aggiornato alla riga ${appendedRowIndex}.`);

    if (!options.skipOrganize) {
      try {
        organizeNotuleSheet();
      } catch (orgErr) {
        Logger.log(`generateDocument: organizeNotuleSheet non eseguito (riga e PDF già salvati): ${orgErr.message}`);
        // Non propagare: riga e PDF sono già stati salvati correttamente in NOTULE e Drive
      }
    }

    let emailMessage = '';
    if (sendEmail) {
      if (associateEmail) {
        MailApp.sendEmail({
          to: associateEmail,
          subject: `Generazione Rimborso: ${newFileName}`,
          body: `Ciao ${associateName.split(' ')[0]},\n\nin allegato trovi il rimborso appena generato.\n\nSaluti.`,
          attachments: [savedPdf]
        });
        emailMessage = ' e inviata via email.';
      } else {
        emailMessage = ' ma non è stato possibile inviarla (email mancante).';
      }
    }
    return {
      message: `Rimborso "${savedPdf.getName()}" creato con successo${emailMessage}`
    };
  } catch (e) {
    Logger.log(`generateDocument Error: ${e.stack}`);
    throw new Error(`Errore durante la generazione del documento: ${e.message}`);
  }
}


/**
 * Funzione per generare il report annuale.
 */
function generateYearlyReport(year) {
  Logger.log(`generateYearlyReport: Richiesta report annuale per anno ${year}.`);
  if (!year) {
    Logger.log("generateYearlyReport: Anno non specificato per il report."); // Changed to Logger.log
    throw new Error("Seleziona un anno per generare il report.");
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = ss.getSheetByName(LOG_SHEET_NAME);
  const logData = logSheet.getDataRange().getValues();
  Logger.log(`generateYearlyReport: Lette ${logData.length} righe dal foglio log.`);

  const reportData = {};
  let totalYearlyReimbursement = 0;

  for (let i = 1; i < logData.length; i++) {
    const row = logData[i];
    const rowYear = String(row[LOG_COL_INDEX.ANNO]).trim();
    const associateName = String(row[LOG_COL_INDEX.NOME_ASSOCIATO]).trim();
    const amount = parseFloat(row[LOG_COL_INDEX.IMPORTO_LORDO]) || 0;

    if (rowYear === year) {
      if (associateName && amount > 0) {
        reportData[associateName] = (reportData[associateName] || 0) + amount;
        totalYearlyReimbursement += amount;
      }
    }
  }
  Logger.log(`generateYearlyReport: Elaborati dati per ${Object.keys(reportData).length} associati. Totale rimborsi: ${totalYearlyReimbursement.toFixed(2)}.`);

  let reportContent = `REPORT TOTALE RIMBORSI ANNO ${year}\n\n`;
  reportContent += `--------------------------------------------------\n`;
  reportContent += `Associato               Totale Rimborsato\n`;
  reportContent += `--------------------------------------------------\n`;

  const sortedAssociates = Object.keys(reportData).sort();

  sortedAssociates.forEach(name => {
    const amount = reportData[name];
    reportContent += `${name.padEnd(25)} € ${amount.toFixed(2)}\n`;
  });

  reportContent += `--------------------------------------------------\n`;
  reportContent += `TOTALE RIMBORSI ANNO ${year}: € ${totalYearlyReimbursement.toFixed(2)}\n`;
  reportContent += `--------------------------------------------------\n`;
  reportContent += `\nGenerato il: ${Utilities.formatDate(new Date(), scriptTimeZone, 'dd/MM/yyyy HH:mm')}`;

  const rootFolder = DriveApp.getFolderById(ROOT_REIMBURSEMENTS_FOLDER_ID);
  const yearFolder = getOrCreateFolder(rootFolder, `Rimborsi ${year}`);  
  Logger.log(`generateYearlyReport: Cartella per report: "${yearFolder.getName()}".`);

  const fileName = `${year} Report Totale Rimborsi`;
  const newDoc = DocumentApp.create(fileName);
  newDoc.getBody().setText(reportContent);
  newDoc.saveAndClose();
  Logger.log("generateYearlyReport: Documento temporaneo creato.");

  const pdfFile = DriveApp.getFileById(newDoc.getId()).getAs('application/pdf');
  const savedPdf = yearFolder.createFile(pdfFile).setName(fileName + ".pdf");

  DriveApp.getFileById(newDoc.getId()).setTrashed(true);
  Logger.log(`generateYearlyReport: PDF finale salvato a ${savedPdf.getUrl()}. Documento temporaneo cestinato.`);

  Logger.log("generateYearlyReport: Completato.");
  return {
    message: `Report "${savedPdf.getName()}" generato con successo nella cartella "Rimborsi ${year}".`,
    url: savedPdf.getUrl()
  };
}

function generateDetailedReimbursementsReport(year, associateName = '') {
  Logger.log(`generateDetailedReimbursementsReport: Richiesta report dettagliato. Anno: ${year}, Associato: ${associateName || 'TUTTI'}.`);
  if (!year) {
    Logger.log("generateDetailedReimbursementsReport: Anno non specificato per la generazione del report."); // Changed to Logger.log
    throw new Error("Anno non specificato per la generazione del report.");
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!logSheet) {
    Logger.log(`generateDetailedReimbursementsReport: Foglio "${LOG_SHEET_NAME}" non trovato.`); // Changed to Logger.log
    throw new Error(`Foglio "${LOG_SHEET_NAME}" non trovato.`);
  }

  const logData = logSheet.getDataRange().getValues();
  let reportContent = '';
  let totalAmount = 0;
  Logger.log(`generateDetailedReimbursementsReport: Lette ${logData.length} righe dal foglio log.`);

  const filteredData = logData.slice(1).filter(row => {
    const rowYear = String(row[LOG_COL_INDEX.ANNO]).trim();
    const rowAssociate = String(row[LOG_COL_INDEX.NOME_ASSOCIATO] || '').trim();
    const matchesYear = (rowYear === year);
    const matchesAssociate = (!associateName || rowAssociate === associateName.trim());
    return matchesYear && matchesAssociate;
  });
  Logger.log(`generateDetailedReimbursementsReport: Filtrati ${filteredData.length} rimborsi.`);

  if (filteredData.length === 0) {
    Logger.log(`generateDetailedReimbursementsReport: Nessun rimborso trovato per l'anno ${year}` + (associateName ? ` e l'associato ${associateName}` : '') + "."); // Changed to Logger.log
    throw new Error(`Nessun rimborso trovato per l'anno ${year}` + (associateName ? ` e l'associato ${associateName}` : '') + ".");
  }

  filteredData.sort((a, b) => {
    const dateA = a[LOG_COL_INDEX.DATA_GENERAZIONE];
    const dateB = b[LOG_COL_INDEX.DATA_GENERAZIONE];
    const nameA = String(a[LOG_COL_INDEX.NOME_ASSOCIATO] || '').trim();
    const nameB = String(b[LOG_COL_INDEX.NOME_ASSOCIATO] || '').trim();

    if (associateName) {
      return dateA - dateB;
    } else {
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return dateA - dateB;
    }
  });
  Logger.log("generateDetailedReimbursementsReport: Dati rimborsi ordinati.");

  let currentAssociateForGrouping = '';

  reportContent += `REPORT DETTAGLIATO RIMBORSI ANNO ${year}\n\n`;
  if (associateName) {
    reportContent += `Associato: ${associateName}\n\n`;
  }
  reportContent += `Generato il: ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')}\n\n`;
  reportContent += `--------------------------------------------------\n`;


  filteredData.forEach(row => {
    const genDate = Utilities.formatDate(row[LOG_COL_INDEX.DATA_GENERAZIONE], Session.getScriptTimeZone(), 'dd/MM/yyyy');
    const progressive = row[LOG_COL_INDEX.PROGRESSIVO] || 'N/D';
    const grossAmount = parseFloat(row[LOG_COL_INDEX.IMPORTO_LORDO]) || 0;
    const rtrn = parseFloat(row[LOG_COL_INDEX.RITENUTA]) || 0; 
    const netAmount = parseFloat(row[LOG_COL_INDEX.IMPORTO_NETTO]) || 0; 
    
    const name = String(row[LOG_COL_INDEX.NOME_ASSOCIATO] || '').trim();
    const payMethod = row[LOG_COL_INDEX.METODO_PAGAMENTO] || 'N/D';
    const payDate = Utilities.formatDate(row[LOG_COL_INDEX.DATA_PAGAMENTO], Session.getScriptTimeZone(), 'dd/MM/yyyy');
    const receipts = row[LOG_COL_INDEX.RICEVUTE] || 'N/D';

    if (!associateName && name !== currentAssociateForGrouping) {
      if (currentAssociateForGrouping !== '') {
        reportContent += `\n--------------------------------------------------\n`;
      }
      reportContent += `\n--- Associato: ${name} ---\n\n`;
      currentAssociateForGrouping = name;
    }


    reportContent += `Data Emiss.: ${genDate} - Rif: ${progressive}/${year}\n`;
    reportContent += `Importo: € ${grossAmount.toFixed(2)} (Ritenuta: € ${rtrn.toFixed(2)}, Netto: € ${netAmount.toFixed(2)})\n`;
    reportContent += `Pagato: ${payMethod} in data ${payDate} - Ricevute: ${receipts}\n`;
    reportContent += `URL PDF: ${row[LOG_COL_INDEX.URL_PDF] || 'N/D'}\n`;
    reportContent += `\n`; 

    totalAmount += grossAmount;
  });

  reportContent += `--------------------------------------------------\n`;
  reportContent += `TOTALE RIMBORSI ANNO ${year}` + (associateName ? ` per ${associateName}` : '') + `: € ${totalAmount.toFixed(2)}\n`;
  reportContent += `--------------------------------------------------\n`;

  const rootFolder = DriveApp.getFolderById(ROOT_REIMBURSEMENTS_FOLDER_ID);
  const yearFolder = getOrCreateFolder(rootFolder, `Rimborsi ${year}`);
  Logger.log(`generateDetailedReimbursementsReport: Cartella per report: "${yearFolder.getName()}".`);

  let fileName = `${year} Report Rimborsi Dettagliato`;
  if (associateName) {
    fileName += ` - ${associateName}`;
  }

  const newDoc = DocumentApp.create(fileName);
  newDoc.getBody().setText(reportContent);
  newDoc.saveAndClose();
  Logger.log("generateDetailedReimbursementsReport: Documento temporaneo creato.");

  const pdfFile = DriveApp.getFileById(newDoc.getId()).getAs('application/pdf');
  const savedPdf = yearFolder.createFile(pdfFile).setName(fileName + ".pdf");
  DriveApp.getFileById(newDoc.getId()).setTrashed(true);
  Logger.log(`generateDetailedReimbursementsReport: PDF finale salvato a ${savedPdf.getUrl()}. Documento temporaneo cestinato.`);

  Logger.log("generateDetailedReimbursementsReport: Completato.");
  return {
    message: `Report "${savedPdf.getName()}" generato con successo.`,
    url: savedPdf.getUrl()
  };
}

// --- Funzioni relative a "Rubrica Associati" ---

/**
 * [MINIMAL+SEARCH] Recupera i dati essenziali PER LA LISTA E LA RICERCA.
 * Versione aggiornata per includere il Telegram Chat ID e ordinare per cognome.
 */
function getAssociati() {
  Logger.log("getAssociati (Rubrica): Inizio esecuzione chiamata da client.");
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);
    if (!sheet) {
      throw new Error(`Foglio "${ASSOCIATES_SHEET_NAME}" non trovato.`);
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return []; // Foglio vuoto
    }

    const numColsToRead = COL_INDEX.TELEGRAM_CHAT_ID + 1; 
    
    const dataRange = sheet.getRange(2, 1, lastRow - 1, numColsToRead);
    const values = dataRange.getValues();

    const associatiMinimal = [];
    for (let i = 0; i < values.length; i++) {
      const rowNumber = i + 2;
      const rowData = values[i];
      const nome = rowData[COL_INDEX.NOME];
      const cognome = rowData[COL_INDEX.COGNOME];

      if ((nome && String(nome).trim() !== "") || (cognome && String(cognome).trim() !== "")) {
        associatiMinimal.push({
          rowNumber: rowNumber,
          numero: String(rowData[COL_INDEX.NUMERO_ASSOCIATO] || ""),
          nome: String(nome || ""),
          cognome: String(cognome || ""),
          cellulare: String(rowData[COL_INDEX.TELEFONO] || ""),
          email: String(rowData[COL_INDEX.EMAIL] || ""),
          telegramChatId: String(rowData[COL_INDEX.TELEGRAM_CHAT_ID] || "") 
        });
      }
    }
    
    // NUOVA LOGICA: Ordina la lista per cognome, e poi per nome in caso di cognomi uguali.
    associatiMinimal.sort((a, b) => {
        const cognomeCompare = a.cognome.localeCompare(b.cognome);
        if (cognomeCompare !== 0) {
            return cognomeCompare;
        }
        return a.nome.localeCompare(b.nome);
    });
    
    Logger.log(`getAssociati (Rubrica): Elaborazione completata. Record validi trovati: ${associatiMinimal.length}.`);
    return associatiMinimal;

  } catch (error) {
    Logger.log("Errore GRAVE in getAssociati (Rubrica): " + error.stack);
    throw new Error(`Errore recupero lista associati Rubrica: ${error.message}.`);
  }
}

/**
 * Recupera i dettagli COMPLETI di un singolo associato,
 * leggendo i dati anagrafici da 'ASSOCIATI' e i pagamenti delle quote dal nuovo foglio 'QUOTE'.
 * @param {number} rowNumber Il numero della riga dell'associato nel foglio 'ASSOCIATI'.
 * @returns {object} Un oggetto con tutti i dettagli dell'associato per il popup.
 */
function getAssociatoDetails(rowNumber) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const associatesSheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);

    if (rowNumber > associatesSheet.getLastRow()) {
      throw new Error(`Riga ${rowNumber} non valida.`);
    }

    // Legge tutti i dati dalla riga dell'associato
    const values = associatesSheet.getRange(rowNumber, 1, 1, associatesSheet.getLastColumn()).getValues()[0];

    // 1. Popola i dati anagrafici e del tutore
    const details = {
      rowNumber: rowNumber,
      numero: values[COL_INDEX.NUMERO_ASSOCIATO] || "",
      dataIscrizione: formatDateForInput(values[COL_INDEX.DATA_ISCRIZIONE]),
      nome: values[COL_INDEX.NOME] || "",
      cognome: values[COL_INDEX.COGNOME] || "",
      luogoNascita: values[COL_INDEX.LUOGO_NASCITA] || "",
      dataNascita: formatDateForInput(values[COL_INDEX.DATA_NASCITA]),
      indirizzo: values[COL_INDEX.INDIRIZZO] || "",
      codiceFiscale: values[COL_INDEX.CODICE_FISCALE] || "",
      cellulare: values[COL_INDEX.TELEFONO] || "",
      email: values[COL_INDEX.EMAIL] || "",
      telegramChatId: values[COL_INDEX.TELEGRAM_CHAT_ID] || "",
      tutore: {
        numeroTutore: values[COL_INDEX.NUMERO_TUTORE] || "",
        nomeCompletoTutore: values[COL_INDEX.NOME_COMPLETO_TUTORE] || "",
        tutoreNomeManuale: values[COL_INDEX.TUTORE_NOME_MANUALE] || "",
        tutoreCognomeManuale: values[COL_INDEX.TUTORE_COGNOME_MANUALE] || "",
        tutoreCellulareManuale: values[COL_INDEX.TUTORE_CELLULARE_MANUALE] || "",
        tutoreEmailManuale: values[COL_INDEX.TUTORE_EMAIL_MANUALE] || "",
        tutoreCfManuale: values[COL_INDEX.TUTORE_CF_MANUALE] || ""
      },
      quotaPagamenti: {}, // Verrà riempito sotto
      availableYears: getQuotaSettings().map(s => s.year).sort((a, b) => b - a),
      currentYear: new Date().getFullYear().toString()
    };

    // 2. Cerca i pagamenti delle quote nel foglio 'QUOTE' usando Nome e Cognome
    const fullName = `${details.nome} ${details.cognome}`.trim();
    if (fullName) {
      const quoteSheet = ss.getSheetByName(QUOTE_SHEET_NAME);
      if (quoteSheet && quoteSheet.getLastRow() > 1) {
        const quoteData = quoteSheet.getDataRange().getValues();
        // Salta l'intestazione (i=1) e cerca le corrispondenze
        for (let i = 1; i < quoteData.length; i++) {
          const row = quoteData[i];
          const associateNameInQuote = row[0]; // Colonna A: Nome Cognome Associato
          const year = row[1];                 // Colonna B: Anno Quota
          const paymentDate = row[2];          // Colonna C: Data Pagamento

          if (associateNameInQuote === fullName) {
            details.quotaPagamenti[year.toString()] = formatDateForInput(paymentDate);
          }
        }
      }
    }

    Logger.log(`Dettagli quote recuperati per ${fullName}: ${JSON.stringify(details.quotaPagamenti)}`);
    return details;

  } catch (e) {
    Logger.log(`Errore in getAssociatoDetails per riga ${rowNumber}: ${e.stack}`);
    throw new Error(`Impossibile recuperare i dettagli dell'associato: ${e.message}`);
  }
}

/**
 * Aggiorna i dati di un associato esistente.
 * Modifica la riga nel foglio 'ASSOCIATI' e aggiorna/inserisce il pagamento della quota
 * nel foglio 'QUOTE' usando NOME+COGNOME come chiave.
 */
function updateAssociatoFromRubrica(rowDataObject) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);
    const rowNumber = rowDataObject.rowNumber;
    const data = rowDataObject.data;
    const tutoreData = data.tutore || {};

    // 1. Aggiorna i dati nel foglio ASSOCIATI
    sheet.getRange(rowNumber, COL_INDEX.NUMERO_ASSOCIATO + 1).setValue(data.numero || "");
    sheet.getRange(rowNumber, COL_INDEX.DATA_ISCRIZIONE + 1).setValue(parseDateFromInput(data.dataIscrizione));
    sheet.getRange(rowNumber, COL_INDEX.NOME + 1).setValue(data.nome || "");
    sheet.getRange(rowNumber, COL_INDEX.COGNOME + 1).setValue(data.cognome || "");
    sheet.getRange(rowNumber, COL_INDEX.LUOGO_NASCITA + 1).setValue(data.luogoNascita || "");
    sheet.getRange(rowNumber, COL_INDEX.DATA_NASCITA + 1).setValue(parseDateFromInput(data.dataNascita));
    sheet.getRange(rowNumber, COL_INDEX.INDIRIZZO + 1).setValue(data.indirizzo || "");
    sheet.getRange(rowNumber, COL_INDEX.CODICE_FISCALE + 1).setValue(data.codiceFiscale || "");
    sheet.getRange(rowNumber, COL_INDEX.TELEFONO + 1).setValue(data.cellulare || "");
    sheet.getRange(rowNumber, COL_INDEX.EMAIL + 1).setValue(data.email || "");
    sheet.getRange(rowNumber, COL_INDEX.TELEGRAM_CHAT_ID + 1).setValue(data.telegramChatId || "");
    sheet.getRange(rowNumber, COL_INDEX.NUMERO_TUTORE + 1).setValue(tutoreData.numeroTutore || "");
    sheet.getRange(rowNumber, COL_INDEX.NOME_COMPLETO_TUTORE + 1).setValue(tutoreData.nomeCompletoTutore || "");
    sheet.getRange(rowNumber, COL_INDEX.TUTORE_NOME_MANUALE + 1).setValue(tutoreData.tutoreNomeManuale || "");
    sheet.getRange(rowNumber, COL_INDEX.TUTORE_COGNOME_MANUALE + 1).setValue(tutoreData.tutoreCognomeManuale || "");
    sheet.getRange(rowNumber, COL_INDEX.TUTORE_CELLULARE_MANUALE + 1).setValue(tutoreData.tutoreCellulareManuale || "");
    sheet.getRange(rowNumber, COL_INDEX.TUTORE_EMAIL_MANUALE + 1).setValue(tutoreData.tutoreEmailManuale || "");
    sheet.getRange(rowNumber, COL_INDEX.TUTORE_CF_MANUALE + 1).setValue(tutoreData.tutoreCfManuale || "");

    // 2. Aggiorna o inserisce la quota nel foglio QUOTE
    const fullName = `${data.nome} ${data.cognome}`.trim();
    const selectedYear = data.quotaAnno;
    const paymentDateYMD = data.quotaData;

    // Esegui solo se sono stati forniti dati validi per la quota
    if (selectedYear && paymentDateYMD && fullName) {
        const quoteSheet = ss.getSheetByName(QUOTE_SHEET_NAME);
        const quoteData = quoteSheet.getDataRange().getValues();
        let existingRowIndex = -1;

        // Cerca se esiste già un pagamento per quell'associato e quell'anno
        for (let i = 1; i < quoteData.length; i++) {
            if (quoteData[i][0] === fullName && quoteData[i][1].toString() === selectedYear) {
                existingRowIndex = i + 1; // +1 perché gli indici degli array partono da 0, le righe da 1
                break;
            }
        }

        const paymentDateObj = parseDateFromInput(paymentDateYMD);
        const quotaAmount = (getQuotaSettings().find(s => s.year.toString() === selectedYear) || {}).amount || 0;

        if (existingRowIndex > -1) {
            // Se la riga esiste, aggiorna la data di pagamento e l'importo
            quoteSheet.getRange(existingRowIndex, 3).setValue(paymentDateObj);
            quoteSheet.getRange(existingRowIndex, 4).setValue(quotaAmount);
        } else {
            // Altrimenti, aggiungi una nuova riga di pagamento
            quoteSheet.appendRow([fullName, selectedYear, paymentDateObj, quotaAmount]);
        }
    }
    
    SpreadsheetApp.flush(); // Assicura che tutte le modifiche vengano scritte
    return { success: true, message: "Associato aggiornato con successo." };

  } catch (e) {
    Logger.log(`Errore GRAVE in updateAssociatoFromRubrica: ${e.stack}`);
    throw new Error(`Errore durante l'aggiornamento dell'associato: ${e.message}`);
  }
}

/**
 * Aggiunge un nuovo associato al foglio 'ASSOCIATI' e registra la sua prima quota
 * nel foglio 'QUOTE', usando NOME+COGNOME come chiave.
 * @param {object} newRecordData L'oggetto contenente tutti i dati del nuovo associato dal form.
 * @returns {object} Un oggetto che indica il successo dell'operazione.
 */
function addAssociato(newRecordData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);
    const tutoreData = newRecordData.tutore || {};

    // 1. Calcola il prossimo "Numero Associato" disponibile
    let nextNumero = 1;
    if (sheet.getLastRow() >= 2) {
      const rangeNum = sheet.getRange(2, COL_INDEX.NUMERO_ASSOCIATO + 1, sheet.getLastRow() - 1, 1);
      const valuesNum = rangeNum.getValues();
      const maxNum = valuesNum.reduce((max, row) => {
        const currentNum = parseInt(row[0], 10);
        return (!isNaN(currentNum) && currentNum > max) ? currentNum : max;
      }, 0);
      nextNumero = maxNum + 1;
    }

    // 2. Prepara la riga con tutti i dati anagrafici da inserire nel foglio ASSOCIATI
    const newRowArray = [];
    newRowArray[COL_INDEX.NUMERO_ASSOCIATO] = nextNumero;
    newRowArray[COL_INDEX.DATA_ISCRIZIONE] = parseDateFromInput(newRecordData.dataIscrizione);
    newRowArray[COL_INDEX.NOME] = newRecordData.nome || "";
    newRowArray[COL_INDEX.COGNOME] = newRecordData.cognome || "";
    newRowArray[COL_INDEX.LUOGO_NASCITA] = newRecordData.luogoNascita || "";
    newRowArray[COL_INDEX.DATA_NASCITA] = parseDateFromInput(newRecordData.dataNascita);
    newRowArray[COL_INDEX.INDIRIZZO] = newRecordData.indirizzo || "";
    newRowArray[COL_INDEX.CODICE_FISCALE] = newRecordData.codiceFiscale || "";
    newRowArray[COL_INDEX.TELEFONO] = newRecordData.cellulare || "";
    newRowArray[COL_INDEX.EMAIL] = newRecordData.email || "";
    newRowArray[COL_INDEX.TELEGRAM_CHAT_ID] = newRecordData.telegramChatId || "";
    newRowArray[COL_INDEX.NUMERO_TUTORE] = tutoreData.numeroTutore || "";
    newRowArray[COL_INDEX.NOME_COMPLETO_TUTORE] = tutoreData.nomeCompletoTutore || "";
    newRowArray[COL_INDEX.TUTORE_NOME_MANUALE] = tutoreData.tutoreNomeManuale || "";
    newRowArray[COL_INDEX.TUTORE_COGNOME_MANUALE] = tutoreData.tutoreCognomeManuale || "";
    newRowArray[COL_INDEX.TUTORE_CELLULARE_MANUALE] = tutoreData.tutoreCellulareManuale || "";
    newRowArray[COL_INDEX.TUTORE_EMAIL_MANUALE] = tutoreData.tutoreEmailManuale || "";
    newRowArray[COL_INDEX.TUTORE_CF_MANUALE] = tutoreData.tutoreCfManuale || "";
    
    sheet.appendRow(newRowArray);

    // 3. Aggiunge il pagamento della quota (se presente) nel foglio QUOTE
    const fullName = `${newRecordData.nome} ${newRecordData.cognome}`.trim();
    const selectedYear = newRecordData.quotaAnno;
    const paymentDateYMD = newRecordData.quotaData;

    if (selectedYear && paymentDateYMD && fullName) {
      const paymentDateObj = parseDateFromInput(paymentDateYMD);
      if (paymentDateObj) {
        const quoteSheet = ss.getSheetByName(QUOTE_SHEET_NAME);
        const quotaAmount = (getQuotaSettings().find(s => s.year.toString() === selectedYear) || {}).amount || 0;
        quoteSheet.appendRow([fullName, selectedYear, paymentDateObj, quotaAmount]);
      }
    }

    return { success: true, message: "Associato aggiunto con successo." };

  } catch (e) {
    Logger.log(`Errore GRAVE in addAssociato: ${e.stack}`);
    throw new Error(`Impossibile aggiungere l'associato: ${e.message}`);
  }
}

/** Elimina un associato dal foglio principale. Adattato al foglio ASSOCIATI. */
function deleteAssociato(rowNumber) {
  Logger.log(`deleteAssociato (Rubrica): Richiesta eliminazione riga ${rowNumber}`);
  try {
    if (!rowNumber || typeof rowNumber !== 'number' || rowNumber < 2) {
      Logger.log(`deleteAssociato (Rubrica): Numero riga eliminazione non valido: ${rowNumber}`); // Changed to Logger.log
      throw new Error(`Numero riga eliminazione non valido: ${rowNumber}`);
    }
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME); 
    if (!sheet) {
      Logger.log(`deleteAssociato (Rubrica): Foglio "${ASSOCIATES_SHEET_NAME}" non trovato.`); // Changed to Logger.log
      throw new Error(`Foglio "${ASSOCIATES_SHEET_NAME}" non trovato.`);
    }

    const lastRow = sheet.getLastRow();
    if (rowNumber > lastRow) {
        Logger.log(`deleteAssociato (Rubrica): Tentativo eliminazione riga ${rowNumber} non esistente (ultima: ${lastRow}). Considero OK.`); // Changed to Logger.log
        return { success: true };
    }

    sheet.deleteRow(rowNumber);
    Logger.log(`deleteAssociato (Rubrica): Riga ${rowNumber} eliminata da ${ASSOCIATES_SHEET_NAME}.`);
    return { success: true };

  } catch (error) {
    Logger.log(`Errore GRAVE in deleteAssociato (Rubrica, riga ${rowNumber}):`, error); // Changed to Logger.log
    throw new Error(`Errore eliminazione associato Rubrica: ${error.message}.`);
  }
}

// --- NUOVE FUNZIONI PER GESTIONE RIMBORSI (TAB) ---

/**
 * Recupera gli anni per cui ci sono rimborsi registrati.
 */
function getReimbursementYears() {
  Logger.log("getReimbursementYears: Inizio recupero anni rimborsi.");
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logSheet = ss.getSheetByName(LOG_SHEET_NAME);
    let years = [];

    if (logSheet.getLastRow() > 1) {
      const data = logSheet.getRange(2, LOG_COL_INDEX.ANNO + 1, logSheet.getLastRow() - 1, 1).getValues();
      years = data.flat().filter(String).map(String);
      Logger.log(`getReimbursementYears: Trovati ${years.length} anni unici nel log.`);
    } else {
      Logger.log("getReimbursementYears: Foglio log vuoto o solo intestazioni.");
    }
    
    const uniqueYears = [...new Set(years)].sort((a, b) => b - a);
    
    const currentYear = new Date().getFullYear().toString();
    if (!uniqueYears.includes(currentYear)) {
      uniqueYears.unshift(currentYear); 
      Logger.log(`getReimbursementYears: Aggiunto anno corrente (${currentYear}).`);
    }
    Logger.log(`getReimbursementYears: Anni finali: ${uniqueYears.join(', ')}.`);
    return uniqueYears;
    
  } catch (e) {
    Logger.log('getReimbursementYears Error: ' + e.toString()); // Changed to Logger.log
    throw new Error('Impossibile caricare gli anni dei rimborsi: ' + e.message);
  }
}

/**
 * Recupera gli associati che hanno rimborsi nell'anno selezionato.
 * Restituisce solo quelli che compaiono nel log per quell'anno.
 */
function getAssociatesWithReimbursementsForYear(year) {
  Logger.log(`getAssociatesWithReimbursementsForYear: Richiesta associati con rimborsi per anno ${year}.`);
  if (!year) {
    Logger.log("getAssociatesWithReimbursementsForYear: Anno non specificato, ritorno lista vuota."); // Changed to Logger.log
    return [];
  }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logSheet = ss.getSheetByName(LOG_SHEET_NAME);
    const associatesForYear = new Set();

    if (logSheet.getLastRow() > 1) {
      const data = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, LOG_COL_INDEX.NOME_ASSOCIATO + 1).getValues();
      Logger.log(`getAssociatesWithReimbursementsForYear: Lette ${data.length} righe dal log sheet.`);
      
      data.forEach(row => {
        const rowYear = String(row[LOG_COL_INDEX.ANNO]).trim();
        const associateName = String(row[LOG_COL_INDEX.NOME_ASSOCIATO] || '').trim();
        if (rowYear === year && associateName !== '') {
          associatesForYear.add(associateName);
        }
      });
    }
    Logger.log(`getAssociatesWithReimbursementsForYear: Trovati ${associatesForYear.size} associati con rimborsi per anno ${year}.`);
    return [...associatesForYear].sort();
    
  } catch (e) {
    Logger.log(`getAssociatesWithReimbursementsForYear Error for year ${year}: ` + e.toString()); // Changed to Logger.log
    throw new Error(`Impossibile caricare gli associati per l'anno ${year}: ` + e.message);
  }
}

/**
 * Organizza il foglio NOTULE: ordina i dati e inserisce separatori tra gli anni.
 * Esclude le righe separatore (solo anno, senza nome/importo) per non riscriverle come dati.
 */
function organizeNotuleSheet() {
  Logger.log("organizeNotuleSheet: Inizio organizzazione foglio NOTULE.");
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(LOG_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    Logger.log("organizeNotuleSheet: Nessuna riga di dati, organizzazione saltata.");
    return;
  }
  const numCols = Math.max(sheet.getLastColumn(), 12);
  const numDataRows = lastRow - 1;
  Logger.log(`organizeNotuleSheet: Lette ${numDataRows} righe (2..${lastRow}).`);

  const rawData = sheet.getRange(2, 1, numDataRows, numCols).getValues();
  // Escludi righe separatore: solo righe con nome associato e importo lordo > 0
  const data = rawData.filter(function(row) {
    const name = String(row[LOG_COL_INDEX.NOME_ASSOCIATO] || '').trim();
    const amount = parseFloat(row[LOG_COL_INDEX.IMPORTO_LORDO]) || 0;
    return name.length > 0 && amount > 0;
  });
  // #region agent log
  _debugLog('Codice.js:organizeNotuleSheet', 'after filter', { rawCount: rawData.length, filteredCount: data.length, lostRows: rawData.length - data.length }, 'H1');
  // #endregion
  Logger.log(`organizeNotuleSheet: ${data.length} righe dati effettive (escluse separatori).`);

  if (data.length === 0) {
    Logger.log("organizeNotuleSheet: Nessun dato da ordinare.");
    return;
  }

  // Normalizza ogni riga a 12 colonne (A–L): URL solo in H; I–L mai URL (evita corruzione da lettura)
  function looksLikeUrl(v) {
    return typeof v === 'string' && v.trim().indexOf('http') === 0;
  }
  var normalizedData = data.map(function(row) {
    var r = row.slice(0, LOG_NUM_COLS);
    if (r.length < LOG_NUM_COLS) {
      while (r.length < LOG_NUM_COLS) r.push('');
    }
    var url = r[LOG_COL_INDEX.URL_PDF];
    if (!looksLikeUrl(url)) {
      for (var c = LOG_COL_INDEX.URL_PDF; c < Math.min(row.length, 15); c++) {
        if (looksLikeUrl(row[c])) { r[LOG_COL_INDEX.URL_PDF] = row[c]; break; }
      }
    }
    for (var col = LOG_COL_INDEX.METODO_PAGAMENTO; col <= LOG_COL_INDEX.RICEVUTE; col++) {
      if (r[col] !== undefined && looksLikeUrl(r[col])) r[col] = '';
    }
    return r;
  });

  normalizedData.sort((a, b) => {
    const yearA = Number(a[LOG_COL_INDEX.ANNO]) || 0;
    const yearB = Number(b[LOG_COL_INDEX.ANNO]) || 0;
    const nameA = String(a[LOG_COL_INDEX.NOME_ASSOCIATO] || '').trim();
    const nameB = String(b[LOG_COL_INDEX.NOME_ASSOCIATO] || '').trim();
    const progA = a[LOG_COL_INDEX.PROGRESSIVO] || 0;
    const progB = b[LOG_COL_INDEX.PROGRESSIVO] || 0;

    if (yearB !== yearA) return yearB - yearA;
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return progA - progB;
  });
  Logger.log("organizeNotuleSheet: Dati ordinati.");

  // Costruisci array con righe dati + righe separatore (nessun insert: niente sovrascrittura)
  var rowsWithSeparators = [];
  var separatorRowIndices = []; // indici 0-based nell'array rowsWithSeparators (per merge dopo)
  for (var idx = 0; idx < normalizedData.length; idx++) {
    rowsWithSeparators.push(normalizedData[idx]);
    if (idx < normalizedData.length - 1) {
      var yearCur = Number(normalizedData[idx][LOG_COL_INDEX.ANNO]) || 0;
      var yearNext = Number(normalizedData[idx + 1][LOG_COL_INDEX.ANNO]) || 0;
      if (yearCur !== yearNext && yearNext) {
        var sepLabel = 'Anno ' + String(normalizedData[idx][LOG_COL_INDEX.ANNO]);
        var sepRow = [sepLabel, '', '', '', '', '', '', '', '', '', '', ''];
        rowsWithSeparators.push(sepRow);
        separatorRowIndices.push(rowsWithSeparators.length - 1);
      }
    }
  }

  // #region agent log
  _debugLog('Codice.js:organizeNotuleSheet', 'before clear/setValues', { rowsToClear: lastRow - 1, dataLength: rowsWithSeparators.length, separatorCount: separatorRowIndices.length, firstRowYear: rowsWithSeparators.length ? rowsWithSeparators[0][LOG_COL_INDEX.ANNO] : null, firstRowName: rowsWithSeparators.length ? rowsWithSeparators[0][LOG_COL_INDEX.NOME_ASSOCIATO] : null }, 'H2');
  // #endregion

  const rowsToClear = lastRow - 1;
  if (rowsToClear > 0) {
    sheet.getRange(2, 1, rowsToClear, numCols).clearContent();
  }
  sheet.getRange(2, 1, rowsWithSeparators.length, LOG_NUM_COLS).setValues(rowsWithSeparators);
  SpreadsheetApp.flush();
  Logger.log("organizeNotuleSheet: Dati e separatori riscritti nel foglio.");

  // Formatta le righe separatore: merge A–G, sfondo e grassetto
  for (var s = 0; s < separatorRowIndices.length; s++) {
    var sheetRow = 2 + separatorRowIndices[s];
    var sepRange = sheet.getRange(sheetRow, 1, 1, 7);
    sepRange.merge().setBackground('#e0e0e0').setHorizontalAlignment('center').setFontWeight('bold');
  }
  // #region agent log
  _debugLog('Codice.js:organizeNotuleSheet', 'separator rows', { separatorRowIndices: separatorRowIndices, sheetRows: separatorRowIndices.map(function(i) { return 2 + i; }) }, 'H4');
  // #endregion

  // Rimuovi righe vuote in eccesso in fondo
  var lastRowAfter = sheet.getLastRow();
  var firstEmptyRow = 2 + rowsWithSeparators.length;
  if (lastRowAfter > firstEmptyRow) {
    var numToDelete = lastRowAfter - firstEmptyRow + 1;
    sheet.deleteRows(firstEmptyRow, numToDelete);
    Logger.log("organizeNotuleSheet: Rimosse " + numToDelete + " righe vuote in fondo.");
  }
  SpreadsheetApp.flush();
  Logger.log("organizeNotuleSheet: Organizzazione completata.");
}

/**
 * Recupera i dati dei rimborsi per l'anno e/o l'associato specificato,
 * per la visualizzazione nella UI. CALCOLA LO STATO DELLE RICEVUTE.
 * Esclude le righe separatore (solo anno) e le righe incomplete (senza nome o importo).
 * Include l'ultima riga del foglio (fix: non usare getLastRow() - 1).
 */
function getReimbursementDataForDisplay(year, associateName = '') {
    Logger.log(`getReimbursementDataForDisplay: Inizio. Anno: "${year}", Associato: "${associateName || 'TUTTI'}"`);

    if (!year) {
      Logger.log("getReimbursementDataForDisplay: Anno non specificato, ritorno dati vuoti.");
      return { reimbursements: [], totalAmount: "0.00" }; 
    }

    try {
        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        const logSheet = ss.getSheetByName(LOG_SHEET_NAME);
        if (!logSheet) {
          throw new Error("Foglio 'NOTULE' non trovato.");
        }

        const reimbursements = [];
        let totalAmount = 0;

        if (logSheet.getLastRow() > 1) {
            const data = logSheet.getRange(2, 1, logSheet.getLastRow(), logSheet.getLastColumn()).getValues();
            Logger.log(`getReimbursementDataForDisplay: Lette ${data.length} righe dal foglio log.`);

            data.forEach((row, index) => {
                const rowYear = String(row[LOG_COL_INDEX.ANNO] || '').trim();
                const rowAssociate = String(row[LOG_COL_INDEX.NOME_ASSOCIATO] || '').trim();

                const matchesYear = (rowYear === year);
                const matchesAssociate = (!associateName || rowAssociate === associateName.trim());

                if (matchesYear && matchesAssociate) {
                    const grossAmount = parseFloat(row[LOG_COL_INDEX.IMPORTO_LORDO]) || 0;
                    if (!rowAssociate || grossAmount <= 0) return;

                    const receiptsAmount = parseFloat(row[LOG_COL_INDEX.IMPORTO_RICEVUTE]);
                    let receiptsStatus = 'Mancante';
                    if (receiptsAmount >= (grossAmount - 0.001) && grossAmount > 0) {
                        receiptsStatus = 'Completo';
                    } else if (receiptsAmount > 0) {
                        receiptsStatus = 'Parziale';
                    }

                    totalAmount += grossAmount;
                    reimbursements.push({
                        rowIndex: index + 2,
                        progressive: row[LOG_COL_INDEX.PROGRESSIVO] || '',
                        associateName: rowAssociate,
                        amount: grossAmount.toFixed(2),
                        generationDate: formatDateForDisplay(row[LOG_COL_INDEX.DATA_GENERAZIONE]),
                        pdfUrl: row[LOG_COL_INDEX.URL_PDF] || '',
                        receiptsAmount: isNaN(receiptsAmount) ? 0 : receiptsAmount,
                        receiptsStatus: receiptsStatus
                    });
                }
            });
        }

        reimbursements.sort((a, b) => {
            const dateA = new Date(a.generationDate.split('/').reverse().join('-'));
            const dateB = new Date(b.generationDate.split('/').reverse().join('-'));
            if (associateName) {
                return dateB - dateA;
            } else {
                const nameCompare = a.associateName.localeCompare(b.associateName);
                if (nameCompare !== 0) return nameCompare;
                return dateB - dateA;
            }
        });
        Logger.log("getReimbursementDataForDisplay: Dati rimborsi ordinati e pronti.");
        return { reimbursements: reimbursements, totalAmount: totalAmount.toFixed(2) };

    } catch (e) {
        Logger.log(`getReimbursementDataForDisplay: ERRORE CATTURATO: ${e.stack}`);
        throw new Error("Errore interno del server durante il recupero dei dati dei rimborsi: " + e.message);
    }
}

/**
 * Elimina un rimborso specificato dalla riga del log E sposta nel cestino il PDF associato.
 */
function deleteReimbursement(rowIndex) {
  Logger.log(`deleteReimbursement: Richiesta eliminazione rimborso alla riga ${rowIndex}.`);
  try {
    if (!rowIndex || typeof rowIndex !== 'number' || rowIndex < 2) {
      Logger.log(`deleteReimbursement: Numero di riga non valido: ${rowIndex}.`); // Changed to Logger.log
      throw new Error("Numero di riga non valido per l'eliminazione del rimborso.");
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logSheet = ss.getSheetByName(LOG_SHEET_NAME);
    if (!logSheet) {
      Logger.log(`deleteReimbursement: Foglio "${LOG_SHEET_NAME}" non trovato.`); // Changed to Logger.log
      throw new Error(`Foglio "${LOG_SHEET_NAME}" non trovato.`);
    }

    let pdfMessage = "Rimborso eliminato con successo dal registro."; 

    const pdfUrl = logSheet.getRange(rowIndex, LOG_COL_INDEX.URL_PDF + 1).getValue();
    Logger.log(`deleteReimbursement: URL PDF trovato per riga ${rowIndex}: ${pdfUrl}.`);

    logSheet.deleteRow(rowIndex);
    Logger.log(`deleteReimbursement: Riga ${rowIndex} eliminata dal log.`);

    if (pdfUrl) {
      try {
        const match = pdfUrl.match(/d\/([a-zA-Z0-9_-]{25,})/);

        if (match && match[1]) {
          const fileId = match[1];
          DriveApp.getFileById(fileId).setTrashed(true); 
          pdfMessage = "Rimborso e file PDF associato eliminati con successo.";
          Logger.log(`deleteReimbursement: File PDF (ID: ${fileId}) spostato nel cestino.`);
        } else {
          Logger.log(`deleteReimbursement: Impossibile estrarre un ID file valido dall'URL: ${pdfUrl}.`); // Changed to Logger.log
          pdfMessage = "Rimborso eliminato, ma non è stato possibile identificare il PDF associato.";
        }
      } catch (e) {
        Logger.log(`deleteReimbursement: Errore durante l'eliminazione del file PDF (${pdfUrl}): ${e.message}`); // Changed to Logger.log
        pdfMessage = "Rimborso eliminato, ma si è verificato un errore nel cancellare il file PDF da Drive.";
      }
    } else {
        Logger.log("deleteReimbursement: Nessun URL PDF associato trovato, solo riga eliminata dal log.");
    }

    Logger.log("deleteReimbursement: Completato.");
    return { success: true, message: pdfMessage };

  } catch (e) {
    Logger.log(`deleteReimbursement Error (riga ${rowIndex}): ${e.stack}`); // Changed to Logger.log
    throw new Error(`Errore durante l'eliminazione del rimborso: ${e.message}`);
  }
}


function generateAssociatesBook() {
  Logger.log("generateAssociatesBook: Inizio generazione Libro Associati.");
  try {
    const settings = getDrivePathSettings();
    const destinationFolderId = settings.ASSOCIATES_BOOK_FOLDER_ID || ROOT_REIMBURSEMENTS_FOLDER_ID;
    const destinationFolder = DriveApp.getFolderById(destinationFolderId);
    Logger.log(`generateAssociatesBook: Cartella di destinazione: "${destinationFolder.getName()}".`);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);
    if (!sheet) {
      Logger.log(`generateAssociatesBook: Foglio "${ASSOCIATES_SHEET_NAME}" non trovato.`); // Changed to Logger.log
      throw new Error(`Foglio "${ASSOCIATES_SHEET_NAME}" non trovato.`);
    }

    const associati = getAssociati();
    if (associati.length === 0) {
      Logger.log("generateAssociatesBook: Nessun associato trovato nella rubrica."); // Changed to Logger.log
      throw new Error("Nessun associato trovato nella rubrica.");
    }
    Logger.log(`generateAssociatesBook: Trovati ${associati.length} associati da includere.`);

    let bookContent = `LIBRO ASSOCIATI\n\n`;
    bookContent += `Generato il: ${Utilities.formatDate(new Date(), scriptTimeZone, 'dd/MM/yyyy HH:mm')}\n`;
    bookContent += `--------------------------------------------------\n\n`;

    associati.forEach(ass => {
      const details = getAssociatoDetails(ass.rowNumber);
      if (details) {
        bookContent += `Numero: ${details.numero}\n`;
        bookContent += `Nome: ${details.nome} ${details.cognome}\n`;
        bookContent += `Data Iscrizione: ${formatDateForDisplay(parseDateFromInput(details.dataIscrizione))}\n`;
        bookContent += `Data Nascita: ${formatDateForDisplay(parseDateFromInput(details.dataNascita))}\n`;
        bookContent += `Luogo Nascita: ${details.luogoNascita}\n`;
        bookContent += `Indirizzo: ${details.indirizzo}\n`;
        bookContent += `Codice Fiscale: ${details.codiceFiscale}\n`;
        bookContent += `Cellulare: ${details.cellulare}\n`;
        bookContent += `Email: ${details.email}\n`;
        
        if (details.tutore && (details.tutore.numeroTutore || details.tutore.tutoreNomeManuale)) {
            bookContent += `Tutore: `;
            if(details.tutore.numeroTutore) {
                bookContent += `${details.tutore.nomeCompletoTutore} (Associato Num: ${details.tutore.numeroTutore})\n`;
            } else {
                bookContent += `${details.tutore.tutoreNomeManuale} ${details.tutore.tutoreCognomeManuale} (Manuale)\n`;
            }
        }
        bookContent += `--------------------------------------------------\n`;
      } else {
          Logger.log(`generateAssociatesBook: Dettagli non trovati per associato riga ${ass.rowNumber}. Salto.`); // Changed to Logger.log
      }
    });

    const fileName = `Libro Associati - ${Utilities.formatDate(new Date(), scriptTimeZone, 'yyyy-MM-dd')}`;
    const newDoc = DocumentApp.create(fileName);
    newDoc.getBody().setText(bookContent);
    newDoc.saveAndClose();
    Logger.log("generateAssociatesBook: Documento temporaneo creato.");

    const pdfFile = DriveApp.getFileById(newDoc.getId()).getAs('application/pdf');
    const savedPdf = destinationFolder.createFile(pdfFile).setName(fileName + ".pdf");
    DriveApp.getFileById(newDoc.getId()).setTrashed(true);
    Logger.log(`generateAssociatesBook: PDF finale salvato a ${savedPdf.getUrl()}. Documento temporaneo cestinato.`);

    Logger.log("generateAssociatesBook: Completato.");
    return {
      message: `Libro Associati "${savedPdf.getName()}" generato con successo.`,
      url: savedPdf.getUrl()
    };
  } catch (e) {
    Logger.log("Errore in generateAssociatesBook: " + e.toString()); // Changed to Logger.log
    throw new Error("Impossibile generare il Libro Associati: " + e.message);
  }
}


/**
 * Restituisce un token OAuth per l'utente corrente, necessario per il Google Picker API.
 */
function getOAuthToken() {
  Logger.log("getOAuthToken: Richiesta token OAuth.");
  try {
    DriveApp.getRootFolder(); // Una chiamata semplice per assicurarsi che i permessi Drive siano attivi
    const token = ScriptApp.getOAuthToken();
    Logger.log("getOAuthToken: Token OAuth ottenuto (primi 10 caratteri): " + token.substring(0, 10) + "...");
    return token;
  } catch (e) {
    Logger.log("getOAuthToken: Errore nell'ottenere il token OAuth: " + e.stack); // Changed to Logger.log
    throw new Error("Impossibile ottenere il token OAuth. Potrebbe essere necessario ri-autorizzare lo script. " + e.message);
  }
}

/**
 * Normalizza un nome per il confronto: trim, minuscolo, rimozione accenti.
 * Così "Josè Del Castillo", "José Del Castillo" e "JOSE DEL CASTILLO" matchano.
 */
function normalizeNameForCompare(name) {
  if (name == null || typeof name !== 'string') return '';
  var s = name.trim().toLowerCase();
  try {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) {
    return s;
  }
}


/**
 * Calcola il prossimo numero progressivo per un dato associato in un dato anno,
 * come MAX(progressivo già presenti) + 1, così si possono colmare eventuali "buchi" (es. ricreare 01 se manca).
 * Considera solo le righe valide (nome e importo > 0) per evitare i separatori.
 * existingCountOnPage = rimborsi già inseriti nella UI ma non ancora salvati.
 */
function getNextProgressiveNumber(year, associateName, existingCountOnPage = 0) {
  Logger.log(`Calcolo progressivo per ${associateName} (${year}), con ${existingCountOnPage} già presenti nella pagina.`);
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logSheet = ss.getSheetByName(LOG_SHEET_NAME);
    const logData = logSheet.getDataRange().getValues();
    const normalizedSearch = normalizeNameForCompare(associateName);
    const yearStr = String(year).trim();

    let maxProgressive = 0;

    logData.forEach(function(row) {
      const loggedYear = String(row[LOG_COL_INDEX.ANNO] || '').trim();
      const loggedName = String(row[LOG_COL_INDEX.NOME_ASSOCIATO] || '').trim();
      const grossAmount = parseFloat(row[LOG_COL_INDEX.IMPORTO_LORDO]) || 0;
      if (loggedYear !== yearStr) return;
      if (normalizeNameForCompare(loggedName) !== normalizedSearch) return;
      // Solo righe "vere" (escludi separatori e righe incomplete)
      if (!loggedName || grossAmount <= 0) return;

      const prog = parseInt(String(row[LOG_COL_INDEX.PROGRESSIVO] || '0').replace(/\D/g, ''), 10) || 0;
      if (prog > maxProgressive) maxProgressive = prog;
    });

    const finalProgressive = maxProgressive + 1 + existingCountOnPage;
    Logger.log(`Progressivo finale calcolato (max=${maxProgressive}): ${finalProgressive}`);
    return finalProgressive;

  } catch (e) {
    Logger.log(`Errore in getNextProgressiveNumber: ${e.stack}`);
    return 1 + existingCountOnPage;
  }
}


/**
 * Carica tutti i dati necessari all'avvio dell'app in una sola chiamata.
 */
function getInitialAppData() {
  try {
    const associates = getAssociati();
    const settings = getQuotaSettings();
    return {
      associati: associates,
      quotaSettings: settings
    };
  } catch (e) {
    Logger.log("Errore in getInitialAppData: " + e.stack);
    throw new Error("Impossibile caricare i dati iniziali dell'applicazione.");
  }
}



/**
 * Elimina più rimborsi in base a un array di numeri di riga.
 * Cancella anche i file PDF associati da Google Drive.
 */
function deleteMultipleReimbursements(rowIndexes) {
  Logger.log(`Ricevuta richiesta di eliminazione per ${rowIndexes.length} righe.`);
  if (!rowIndexes || rowIndexes.length === 0) {
    throw new Error("Nessuna riga selezionata per l'eliminazione.");
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = ss.getSheetByName(LOG_SHEET_NAME);
  
  // Ordina gli indici in ordine decrescente per evitare problemi di scorrimento delle righe durante l'eliminazione
  rowIndexes.sort((a, b) => b - a);

  let deletedCount = 0;
  rowIndexes.forEach(rowIndex => {
    try {
      const pdfUrl = logSheet.getRange(rowIndex, LOG_COL_INDEX.URL_PDF + 1).getValue();
      if (pdfUrl) {
        const match = pdfUrl.match(/d\/([a-zA-Z0-9_-]{25,})/);
        if (match && match[1]) {
          DriveApp.getFileById(match[1]).setTrashed(true);
        }
      }
      logSheet.deleteRow(rowIndex);
      deletedCount++;
    } catch (e) {
      Logger.log(`Impossibile eliminare la riga ${rowIndex}: ${e.message}`);
    }
  });

  return { message: `${deletedCount} rimborsi eliminati con successo.` };
}

/**
 * Invia via email più rimborsi in base a un array di dati.
 */
function sendMultipleReimbursementEmails(reimbursementData) {
  Logger.log(`Ricevuta richiesta di invio email per ${reimbursementData.length} rimborsi.`);
  if (!reimbursementData || reimbursementData.length === 0) {
    throw new Error("Nessun rimborso selezionato per l'invio.");
  }
  
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const associatesSheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);
  const associatesData = associatesSheet.getDataRange().getValues();
  
  let sentCount = 0;
  reimbursementData.forEach(data => {
    const associateRow = associatesData.find(row => `${row[COL_INDEX.NOME]} ${row[COL_INDEX.COGNOME]}`.trim() === data.associateName.trim());
    if (associateRow && associateRow[COL_INDEX.EMAIL]) {
      try {
        const pdfUrl = data.pdfUrl;
        const match = pdfUrl.match(/d\/([a-zA-Z0-9_-]{25,})/);
        if (match && match[1]) {
          const pdfFile = DriveApp.getFileById(match[1]);
          MailApp.sendEmail({
            to: associateRow[COL_INDEX.EMAIL],
            subject: `Documento di Rimborso`,
            body: `Ciao ${data.associateName.split(' ')[0]},\n\nin allegato trovi il documento di rimborso.\n\nSaluti.`,
            attachments: [pdfFile.getAs(MimeType.PDF)]
          });
          sentCount++;
        }
      } catch (e) {
        Logger.log(`Impossibile inviare email a ${data.associateName}: ${e.message}`);
      }
    }
  });

  return { message: `Email inviate con successo per ${sentCount} rimborsi.` };
}
/**
 * Recupera i 10 associati unici più recenti dal foglio log dei rimborsi.
 */
function getRecentAssociates() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (logSheet.getLastRow() <= 1) {
    return []; // Nessun dato nel log
  }

  const data = logSheet.getRange(2, LOG_COL_INDEX.DATA_GENERAZIONE + 1, logSheet.getLastRow() - 1, LOG_COL_INDEX.NOME_ASSOCIATO).getValues();
  
  // Ordina per data di generazione, dalla più recente alla più vecchia
  data.sort((a, b) => b[0] - a[0]);

  const recentNames = [];
  const uniqueNames = new Set();

  for (const row of data) {
    const name = row[LOG_COL_INDEX.NOME_ASSOCIATO -1];
    if (name && !uniqueNames.has(name)) {
      uniqueNames.add(name);
      recentNames.push(name);
    }
    if (recentNames.length >= 10) {
      break; // Abbiamo trovato 10 nomi unici
    }
  }
  return recentNames;
}

/**
 * Invia un messaggio a un utente specifico su Telegram tramite il bot.
 * @param {string} chatId L'ID univoco della chat di Telegram del destinatario.
 * @param {string} text Il messaggio da inviare.
 */
function sendTelegramMessage(chatId, text) {
  try {
    // 1. Recupera il token salvato nelle proprietà dello script
    const botToken = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      throw new Error("Token del bot Telegram non trovato nelle proprietà dello script.");
    }

    // 2. Prepara l'URL per l'API di Telegram
    const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    // 3. Prepara i dati da inviare
    const payload = {
      'chat_id': chatId,
      'text': text,
      'parse_mode': 'HTML' // Permette di usare tag come <b> per il grassetto
    };

    const options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload)
    };

    // 4. Invia la richiesta a Telegram
    const response = UrlFetchApp.fetch(apiUrl, options);
    Logger.log(`Risposta da Telegram: ${response.getContentText()}`);
    return true; // Successo

  } catch (e) {
    Logger.log(`Errore durante l'invio del messaggio Telegram a ${chatId}: ${e.toString()}`);
    return false; // Fallimento
  }
}

/**
 * FUNZIONE DI SINCRONIZZAZIONE AUTOMATICA.
 * Controlla i messaggi del bot, trova le corrispondenze univoche nella rubrica
 * e scrive automaticamente il Chat ID nel foglio 'ASSOCIATI'.
 */
function sincronizzaIDTelegram() {
  const botToken = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  if (!botToken) {
    Logger.log("Token del bot non trovato. Assicurati di averlo salvato nelle Proprietà dello Script.");
    return;
  }
  
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const associatesSheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);
  const associatesData = associatesSheet.getDataRange().getValues();

  // Creiamo una mappa dei dati esistenti per una ricerca veloce, includendo il numero di riga
  const associatesMap = new Map();
  const existingChatIds = new Set();
  for (let i = 1; i < associatesData.length; i++) {
    const row = associatesData[i];
    const fullName = `${row[COL_INDEX.NOME]} ${row[COL_INDEX.COGNOME]}`.trim();
    const chatId = row[COL_INDEX.TELEGRAM_CHAT_ID];
    if (fullName) {
      associatesMap.set(fullName, { chatId: chatId, rowNumber: i + 1 }); // Memorizza il numero di riga
    }
    if (chatId) {
      existingChatIds.add(chatId.toString());
    }
  }

  const apiUrl = `https://api.telegram.org/bot${botToken}/getUpdates`;
  const response = UrlFetchApp.fetch(apiUrl);
  const updates = JSON.parse(response.getContentText());

  if (!updates.ok || updates.result.length === 0) {
    Logger.log("Nessun nuovo messaggio trovato per il bot.");
    return;
  }
  
  Logger.log("--- Avvio Sincronizzazione Telegram ---");
  let updatedCount = 0;
  
  const uniqueTelegramUsers = {};
  updates.result.forEach(update => {
    const message = update.message || update.edited_message;
    if (message) {
      const chatId = message.chat.id.toString();
      const firstName = message.chat.first_name || '';
      const lastName = message.chat.last_name || '';
      uniqueTelegramUsers[chatId] = `${firstName} ${lastName}`.trim();
    }
  });

  Object.keys(uniqueTelegramUsers).forEach(chatId => {
    const telegramName = uniqueTelegramUsers[chatId];
    
    if (existingChatIds.has(chatId)) {
      // Già associato, non facciamo nulla.
      return; 
    }
    
    // Tentativo di abbinamento intelligente
    const telegramNameParts = telegramName.toLowerCase().split(' ');
    const telegramFirstName = telegramNameParts[0];
    const telegramLastName = telegramNameParts[telegramNameParts.length - 1];

    const potentialMatches = [];
    associatesMap.forEach((value, key) => {
        const sheetFullName = key.toLowerCase();
        const sheetFirstName = (key.split(' ')[0] || '').toLowerCase();
        const sheetLastName = (key.split(' ').pop() || '').toLowerCase();

        if (!value.chatId && (sheetFullName === telegramName.toLowerCase() || (sheetFirstName === telegramFirstName && sheetLastName === telegramLastName))) {
            potentialMatches.push({ name: key, rowNumber: value.rowNumber });
        }
    });
    
    // Se troviamo esattamente UNA corrispondenza, scriviamo l'ID
    if (potentialMatches.length === 1) {
      const match = potentialMatches[0];
      
      // *** AZIONE AUTOMATICA ***
      associatesSheet.getRange(match.rowNumber, COL_INDEX.TELEGRAM_CHAT_ID + 1).setValue(chatId);
      
      Logger.log(`✅ SINCRONIZZATO: L'utente "${telegramName}" è stato associato a "${match.name}" (ID: ${chatId})`);
      existingChatIds.add(chatId); // Aggiorna il set per evitare di riprocessarlo
      updatedCount++;
    } else if (potentialMatches.length > 1) {
      Logger.log(`⚠️ ATTENZIONE - Multipli Risultati per "${telegramName}" (ID: ${chatId}). Controlla manualmente tra: ${potentialMatches.map(m => m.name).join(', ')}`);
    } else {
      Logger.log(`❓ NON TROVATO: L'utente Telegram "${telegramName}" (ID: ${chatId}) non corrisponde a nessun associato libero.`);
    }
  });
  
  Logger.log("--- Riepilogo Sincronizzazione ---");
  Logger.log(`${updatedCount} nuovi Chat ID sono stati aggiunti al foglio 'ASSOCIATI'.`);
  Logger.log("--- Fine ---");
}

/**
 * Recupera tutti i modelli di messaggio salvati dal foglio 'TEMPLATE'.
 */
function getTemplates() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('TEMPLATE');
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  return data.map(row => ({ name: row[0], subject: row[1], body: row[2] }));
}

/**
 * Salva un nuovo modello o aggiorna uno esistente se il nome coincide.
 */
function saveOrUpdateTemplate(name, subject, body) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('TEMPLATE');
  if (!sheet) {
    sheet = ss.insertSheet('TEMPLATE');
    sheet.appendRow(['NomeModello', 'Oggetto', 'TestoMessaggio']);
  }

  const data = sheet.getDataRange().getValues();
  // Cerca la riga con lo stesso nome (partendo dalla seconda riga, dopo l'intestazione)
  let existingRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === name) {
      existingRow = i + 1; // +1 perché gli array sono 0-based, le righe del foglio 1-based
      break;
    }
  }

  if (existingRow > -1) {
    // Trovato: aggiorna la riga esistente
    sheet.getRange(existingRow, 1, 1, 3).setValues([[name, subject, body]]);
    return { success: true, message: `Modello "${name}" aggiornato.` };
  } else {
    // Non trovato: aggiungi una nuova riga
    sheet.appendRow([name, subject, body]);
    return { success: true, message: `Modello "${name}" salvato.` };
  }
}

/**
 * Trova ed elimina un modello di messaggio dal foglio 'TEMPLATE'.
 */
function deleteTemplate(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('TEMPLATE');
  if (!sheet || sheet.getLastRow() <= 1) {
    throw new Error("Nessun modello da eliminare.");
  }

  const data = sheet.getDataRange().getValues();
  let rowIndexToDelete = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === name) {
      rowIndexToDelete = i + 1; // +1 perché gli array sono 0-based
      break;
    }
  }

  if (rowIndexToDelete > -1) {
    sheet.deleteRow(rowIndexToDelete);
    return { success: true, message: `Modello "${name}" eliminato.` };
  } else {
    throw new Error(`Modello "${name}" non trovato.`);
  }
}

/**
 * Trova un modello tramite il suo nome originale e lo aggiorna con i nuovi dati.
 */
function updateTemplate(originalName, newName, newSubject, newBody) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('TEMPLATE');
  if (!sheet || sheet.getLastRow() <= 1) {
    throw new Error("Foglio modelli non trovato o vuoto.");
  }

  const data = sheet.getDataRange().getValues();
  let rowIndexToUpdate = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === originalName) {
      rowIndexToUpdate = i + 1;
      break;
    }
  }

  if (rowIndexToUpdate > -1) {
    sheet.getRange(rowIndexToUpdate, 1, 1, 3).setValues([[newName, newSubject, newBody]]);
    return { success: true, message: `Modello "${newName}" aggiornato.` };
  } else {
    throw new Error(`Modello originale "${originalName}" non trovato.`);
  }
}

/**
 * Invia un messaggio massivo a una lista di destinatari,
 * personalizzando il testo con i segnaposto.
 * @param {object} data Un oggetto contenente {recipients, channel, subject, body}.
 */
function sendBulkMessages(data) {
  const { recipients, channel, subject, body } = data;
  if (!recipients || recipients.length === 0) {
    throw new Error("Nessun destinatario valido.");
  }

  let successCount = 0;
  let failureCount = 0;

  recipients.forEach(recipient => {
    // Personalizza il messaggio sostituendo i segnaposto
    const personalizedBody = body
      .replace(/{{nome}}/g, recipient.nome)
      .replace(/{{cognome}}/g, recipient.cognome)
      .replace(/{{numero}}/g, recipient.numero || '');
      
    const personalizedSubject = subject
      .replace(/{{nome}}/g, recipient.nome)
      .replace(/{{cognome}}/g, recipient.cognome)
      .replace(/{{numero}}/g, recipient.numero || '');

    try {
      if (channel === 'telegram') {
        if (recipient.telegramChatId) {
          sendTelegramMessage(recipient.telegramChatId, personalizedBody);
          successCount++;
        } else {
          failureCount++;
        }
      } else { // Canale Email
        if (recipient.email) {
          MailApp.sendEmail(recipient.email, personalizedSubject, personalizedBody);
          successCount++;
        } else {
          failureCount++;
        }
      }
    } catch (e) {
      Logger.log(`Errore invio a ${recipient.nome} ${recipient.cognome}: ${e.message}`);
      failureCount++;
    }
  });

  return { 
    message: `Invio completato. Messaggi inviati con successo: ${successCount}. Falliti: ${failureCount}.` 
  };
}

/**
 * Aggiorna l'importo delle ricevute per una specifica riga nel foglio NOTULE.
 * @param {number} rowIndex Il numero della riga da modificare.
 * @param {number} newAmount Il nuovo importo delle ricevute da salvare.
 * @returns {object} Un oggetto che indica il successo dell'operazione.
 */
function updateReceiptsAmount(rowIndex, newAmount) {
  Logger.log(`Richiesta di aggiornamento importo ricevute per riga ${rowIndex} a € ${newAmount}`);
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(LOG_SHEET_NAME);
    if (!sheet) {
      throw new Error(`Foglio "${LOG_SHEET_NAME}" non trovato.`);
    }

    if (rowIndex < 2 || rowIndex > sheet.getLastRow()) {
      throw new Error("Numero di riga non valido.");
    }
    
    const amountToSave = parseFloat(newAmount);
    if (isNaN(amountToSave) || amountToSave < 0) {
        throw new Error("L'importo inserito non è un numero valido.");
    }

    // Aggiorna solo la cella nella colonna "Importo Ricevute"
    sheet.getRange(rowIndex, LOG_COL_INDEX.IMPORTO_RICEVUTE + 1).setValue(amountToSave);

    return { success: true, message: "Importo ricevute aggiornato con successo." };

  } catch (e) {
    Logger.log(`Errore in updateReceiptsAmount: ${e.stack}`);
    throw new Error(`Impossibile aggiornare l'importo: ${e.message}`);
  }
}

/**
 * @version 9.0 (FINALE) - Rileva automaticamente il foglio di lavoro corretto.
 * @param {string} fileId L'ID del file di Google Drive da importare.
 * @returns {object} Un piano di importazione.
 * @v_note Aggiunta logica per trovare il foglio corretto cercando le parole chiave "ASSOCIATI" o "TESSERE" nel nome.
 */
function processImportFile(fileId) {
  try {
    Logger.log(`processImportFile v9.0: Avvio analisi con rilevamento automatico del foglio.`);
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const CONFLICT_SHEET_NAME = '_IMPORT_CONFLICTS';
    let conflictSheet = ss.getSheetByName(CONFLICT_SHEET_NAME);
    if (conflictSheet) { conflictSheet.clear(); } else { conflictSheet = ss.insertSheet(CONFLICT_SHEET_NAME).hideSheet(); }
    conflictSheet.appendRow(['ConflictData_JSON', 'QuoteDiscrepancy_JSON']);

    const sourceFile = DriveApp.getFileById(fileId);
    const tempSpreadsheet = SpreadsheetApp.open(sourceFile);
    
    // --- NUOVA LOGICA: Trova il foglio corretto in automatico ---
    const allSheets = tempSpreadsheet.getSheets();
    const keywords = ['ASSOCIATI', 'TESSERE'];
    let sourceSheet = null;
    for (const sheet of allSheets) {
      const sheetName = sheet.getSheetName().toUpperCase();
      if (keywords.some(key => sheetName.includes(key))) {
        sourceSheet = sheet;
        break;
      }
    }
    
    if (!sourceSheet) {
      throw new Error(`Nessun foglio di lavoro valido (contenente "ASSOCIATI" o "TESSERE" nel nome) è stato trovato nel file.`);
    }
    Logger.log(`Trovato foglio di lavoro valido: "${sourceSheet.getSheetName()}".`);
    // --- FINE NUOVA LOGICA ---
    
    const allValues = sourceSheet.getDataRange().getValues();
    let headerRowIndex = -1;
    for (let i = 0; i < allValues.length; i++) {
        if (allValues[i].includes('Nome') && allValues[i].includes('Cognome')) {
            headerRowIndex = i;
            break;
        }
    }
    if (headerRowIndex === -1) {
      throw new Error('Impossibile trovare la riga delle intestazioni.');
    }
    
    const sourceHeaders = allValues[headerRowIndex];
    const sourceData = allValues.slice(headerRowIndex + 1);
    
    // Questa mappa ora funziona sia per il 2021, 2020 e 2019
    const colonnaMap = {
      data_iscrizione: 'Data',
      nome: 'Nome',
      cognome: 'Cognome',
      luogo_nascita: 'Luogo di Nascita',
      data_nascita: 'Data di Nascita',
      indirizzo: 'Indirizzo',
      codice_fiscale: 'CF',
      telefono: 'cell',
      email: 'email'
    };
    
    // Il resto della funzione rimane identico
    const headerIndex = {};
    for (const key in colonnaMap) {
      const colName = colonnaMap[key];
      const index = sourceHeaders.indexOf(colName);
      if (index === -1) throw new Error(`Colonna obbligatoria "${colName}" non trovata!`);
      headerIndex[key] = index;
    }

    const associatesSheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);
    const associatesData = associatesSheet.getDataRange().getValues();
    const associatesMap = new Map();
    for (let i = 1; i < associatesData.length; i++) {
        const row = associatesData[i];
        const nome = (row[COL_INDEX.NOME] || '').trim().toLowerCase();
        const cognome = (row[COL_INDEX.COGNOME] || '').trim().toLowerCase();
        if (nome && cognome) associatesMap.set(`${nome} ${cognome}`, { rowNumber: i + 1, data: row });
    }

    const daAggiungere = [], daAggiornare = [], conflitti = [], quoteDiscrepancy = [];
    sourceData.forEach((sourceRow) => {
      const nomeImport = (sourceRow[headerIndex.nome] || '').trim();
      const cognomeImport = (sourceRow[headerIndex.cognome] || '').trim();
      if (!nomeImport || !cognomeImport) return;
      
      const recordImportato = {
        dataIscrizione: formatDateForInput(sourceRow[headerIndex.data_iscrizione]),
        quotaAnno: null, 
        quotaData: '',
        nome: nomeImport, 
        cognome: cognomeImport, 
        luogoNascita: sourceRow[headerIndex.luogo_nascita] || '',
        dataNascita: formatDateForInput(sourceRow[headerIndex.data_nascita]), 
        indirizzo: sourceRow[headerIndex.indirizzo] || '',
        codiceFiscale: sourceRow[headerIndex.codice_fiscale] || '', 
        cellulare: String(sourceRow[headerIndex.telefono] || ''), 
        email: sourceRow[headerIndex.email] || ''
      };

      const key = `${nomeImport.toLowerCase()} ${cognomeImport.toLowerCase()}`;
      const associatoEsistente = associatesMap.get(key);
      if (!associatoEsistente) { 
        daAggiungere.push(recordImportato); 
      } else {
        const datiEsistenti = associatoEsistente.data;
        let campiDaAggiornare = {}, campiInConflitto = {};
        const campiDaControllare = { email: COL_INDEX.EMAIL, telefono: COL_INDEX.TELEFONO, codiceFiscale: COL_INDEX.CODICE_FISCALE, indirizzo: COL_INDEX.INDIRIZZO };
        
        for(const campo in campiDaControllare){
          const valoreEsistente = String(datiEsistenti[campiDaControllare[campo]] || '').trim();
          const valoreImportato = String(recordImportato[campo] || '').trim();
          if (valoreImportato) {
            if (!valoreEsistente) { 
              campiDaAggiornare[campo] = valoreImportato; 
            } else if (valoreEsistente.toLowerCase() !== valoreImportato.toLowerCase()) { 
              campiInConflitto[campo] = { esistente: valoreEsistente, importato: valoreImportato }; 
            }
          }
        }
        
        if (Object.keys(campiInConflitto).length > 0) {
          const datiEsistentiPuliti = { email: String(datiEsistenti[COL_INDEX.EMAIL] || ''), telefono: String(datiEsistenti[COL_INDEX.TELEFONO] || ''), codiceFiscale: String(datiEsistenti[COL_INDEX.CODICE_FISCALE] || ''), indirizzo: String(datiEsistenti[COL_INDEX.INDIRIZZO] || '') };
          const conflictObject = { esistente: datiEsistentiPuliti, importato: recordImportato, conflitti: Object.keys(campiInConflitto) };
          conflictSheet.appendRow([JSON.stringify(conflictObject), '']);
          conflitti.push(conflictObject);
        } else if (Object.keys(campiDaAggiornare).length > 0) {
          daAggiornare.push({ nome: recordImportato.nome, cognome: recordImportato.cognome, aggiornamenti: campiDaAggiornare });
        }
      }
    });
    
    return { success: true, fileName: sourceFile.getName(), piani: { daAggiungere, daAggiornare, conflitti, quoteDiscrepancy } };
  } catch (e) {
    Logger.log(`Errore GRAVE in processImportFile: ${e.stack}`);
    throw new Error(`Impossibile analizzare il file: ${e.message}.`);
  }
}
/**
 * @version 1.3 - Esegue l'importazione con logica "upsert" per le quote, evitando duplicati.
 * @param {object} piani L'oggetto contenente le liste daAggiungere e daAggiornare.
 * @returns {object} Un riepilogo delle operazioni eseguite.
 * @v_note Aggiunta la verifica di esistenza prima di inserire una quota per prevenire duplicati.
 */
function executeImport(piani) {
  try {
    Logger.log(`executeImport v1.3: Avvio scrittura dati con logica upsert per le quote.`);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const associatesSheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);
    const quoteSheet = ss.getSheetByName(QUOTE_SHEET_NAME);
    
    let addedCount = 0;
    let updatedCount = 0;
    let quotesUpsertedCount = 0;

    // Leggiamo i dati delle quote esistenti una sola volta per efficienza
    const existingQuotesData = quoteSheet.getDataRange().getValues();

    let nextNumero = 1;
    if (associatesSheet.getLastRow() >= 2) {
      const rangeNum = associatesSheet.getRange(2, COL_INDEX.NUMERO_ASSOCIATO + 1, associatesSheet.getLastRow() - 1, 1);
      const valuesNum = rangeNum.getValues();
      const maxNum = valuesNum.reduce((max, row) => {
        const currentNum = parseInt(row[0], 10);
        return (!isNaN(currentNum) && currentNum > max) ? currentNum : max;
      }, 0);
      nextNumero = maxNum + 1;
    }

    piani.daAggiungere.forEach(record => {
      const newRowArray = new Array(associatesSheet.getLastColumn()).fill('');
      newRowArray[COL_INDEX.NUMERO_ASSOCIATO] = nextNumero++;
      newRowArray[COL_INDEX.DATA_ISCRIZIONE] = parseDateFromInput(record.dataIscrizione);
      newRowArray[COL_INDEX.NOME] = record.nome;
      newRowArray[COL_INDEX.COGNOME] = record.cognome;
      newRowArray[COL_INDEX.LUOGO_NASCITA] = record.luogoNascita;
      newRowArray[COL_INDEX.DATA_NASCITA] = parseDateFromInput(record.dataNascita);
      newRowArray[COL_INDEX.INDIRIZZO] = record.indirizzo;
      newRowArray[COL_INDEX.CODICE_FISCALE] = record.codiceFiscale;
      newRowArray[COL_INDEX.TELEFONO] = record.cellulare;
      newRowArray[COL_INDEX.EMAIL] = record.email;
      
      associatesSheet.appendRow(newRowArray);
      addedCount++;

      // Logica UPSERT per le quote
      if (record.quotaAnno && record.quotaData) {
        const fullName = `${record.nome} ${record.cognome}`.trim();
        const paymentDate = parseDateFromInput(record.quotaData);
        
        let existingRowIndex = -1;
        // Cerca la riga esistente (partendo da 1 per saltare l'header)
        for (let i = 1; i < existingQuotesData.length; i++) {
            if (existingQuotesData[i][0] === fullName && existingQuotesData[i][1].toString() === record.quotaAnno.toString()) {
                existingRowIndex = i + 1; // Le righe sono 1-based
                break;
            }
        }

        const quotaSettings = getQuotaSettings();
        const amountSetting = quotaSettings.find(q => q.year === record.quotaAnno);
        const amount = amountSetting ? amountSetting.amount : 0;
        
        if (existingRowIndex > -1) {
            // Trovato: AGGIORNA la riga esistente
            quoteSheet.getRange(existingRowIndex, 3).setValue(paymentDate); // Colonna C: Data
            quoteSheet.getRange(existingRowIndex, 4).setValue(amount);      // Colonna D: Importo
        } else {
            // Non trovato: AGGIUNGI una nuova riga
            const newQuoteRow = [fullName, record.quotaAnno, paymentDate, amount];
            quoteSheet.appendRow(newQuoteRow);
            existingQuotesData.push(newQuoteRow); 
        }
        quotesUpsertedCount++;
      }
    });

    if (piani.daAggiornare.length > 0) {
      const allAssociatesData = associatesSheet.getDataRange().getValues();
      piani.daAggiornare.forEach(record => {
        const key = `${record.nome.toLowerCase()} ${record.cognome.toLowerCase()}`;
        for (let i = 1; i < allAssociatesData.length; i++) {
          const row = allAssociatesData[i];
          const rowKey = `${(row[COL_INDEX.NOME] || '').trim().toLowerCase()} ${(row[COL_INDEX.COGNOME] || '').trim().toLowerCase()}`;
          
          if (rowKey === key) {
            const rowIndex = i + 1;
            for (const campo in record.aggiornamenti) {
                const valoreDaAggiornare = record.aggiornamenti[campo];
                switch (campo) {
                    case 'email': associatesSheet.getRange(rowIndex, COL_INDEX.EMAIL + 1).setValue(valoreDaAggiornare); break;
                    case 'telefono': associatesSheet.getRange(rowIndex, COL_INDEX.TELEFONO + 1).setValue(valoreDaAggiornare); break;
                    case 'codiceFiscale': associatesSheet.getRange(rowIndex, COL_INDEX.CODICE_FISCALE + 1).setValue(valoreDaAggiornare); break;
                    case 'indirizzo': associatesSheet.getRange(rowIndex, COL_INDEX.INDIRIZZO + 1).setValue(valoreDaAggiornare); break;
                }
            }
            updatedCount++;
            break; 
          }
        }
      });
    }

    Logger.log(`Importazione completata. Aggiunti: ${addedCount}, Aggiornati: ${updatedCount}, Quote elaborate: ${quotesUpsertedCount}.`);
    return {
      success: true,
      message: `Importazione completata! ${addedCount} associati aggiunti, ${updatedCount} aggiornati. ${quotesUpsertedCount} quote elaborate (aggiunte/aggiornate).`
    };

  } catch (e) {
    Logger.log(`Errore GRAVE in executeImport: ${e.stack}`);
    throw new Error(`Si è verificato un errore durante la scrittura dei dati: ${e.message}`);
  }
}

/**
 * @version 1.0 - Legge e restituisce tutti i conflitti salvati dal foglio _IMPORT_CONFLICTS.
 * @returns {Array<Object>} Un array di oggetti, ciascuno rappresentante un conflitto.
 */
function getConflicts() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const conflictSheet = ss.getSheetByName('_IMPORT_CONFLICTS');
    if (!conflictSheet || conflictSheet.getLastRow() <= 1) {
      return []; // Nessun conflitto da risolvere
    }

    // Legge tutti i dati tranne l'intestazione
    const data = conflictSheet.getRange(2, 1, conflictSheet.getLastRow() - 1, 1).getValues();
    
    // Converte ogni riga da stringa JSON a oggetto JavaScript
    const conflicts = data.map(row => JSON.parse(row[0]));
    
    Logger.log(`Recuperati ${conflicts.length} conflitti da risolvere.`);
    return conflicts;

  } catch (e) {
    Logger.log(`Errore in getConflicts: ${e.stack}`);
    throw new Error(`Impossibile recuperare i conflitti: ${e.message}`);
  }
}

/**
 * @version 1.0 - Risolve un singolo conflitto aggiornando i dati nel foglio 'ASSOCIATI'.
 * @param {object} resolution Un oggetto contenente i dati dell'associato e le scelte dell'utente.
 * Esempio: { nome: "Mario", cognome: "Rossi", scelte: { email: "importato" } }
 * @returns {object} Un messaggio di successo o fallimento.
 */
function resolveConflict(resolution) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const associatesSheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);
    const allAssociatesData = associatesSheet.getDataRange().getValues();

    const key = `${resolution.nome.toLowerCase()} ${resolution.cognome.toLowerCase()}`;
    let rowIndexToUpdate = -1;

    // 1. Trova la riga dell'associato da aggiornare
    for (let i = 1; i < allAssociatesData.length; i++) {
      const row = allAssociatesData[i];
      const rowKey = `${(row[COL_INDEX.NOME] || '').trim().toLowerCase()} ${(row[COL_INDEX.COGNOME] || '').trim().toLowerCase()}`;
      if (rowKey === key) {
        rowIndexToUpdate = i + 1;
        break;
      }
    }

    if (rowIndexToUpdate === -1) {
      throw new Error(`Associato "${resolution.nome} ${resolution.cognome}" non trovato per la risoluzione.`);
    }

    // 2. Applica le modifiche in base alle scelte dell'utente
    for (const field in resolution.scelte) {
      if (resolution.scelte[field] === 'importato') {
        const valueToUpdate = resolution.valoriImportati[field];
        // In base al campo, aggiorna la colonna corretta
        switch (field) {
          case 'email':
            associatesSheet.getRange(rowIndexToUpdate, COL_INDEX.EMAIL + 1).setValue(valueToUpdate);
            break;
          case 'telefono':
            associatesSheet.getRange(rowIndexToUpdate, COL_INDEX.TELEFONO + 1).setValue(valueToUpdate);
            break;
          // Aggiungere qui altri "case" se in futuro gestiremo altri campi di conflitto
        }
      }
    }
    
    Logger.log(`Conflitto risolto per ${resolution.nome} ${resolution.cognome}.`);
    return { success: true };

  } catch (e) {
    Logger.log(`Errore in resolveConflict: ${e.stack}`);
    // Non lanciamo un errore al client per non bloccare la UI, ma lo logghiamo.
    return { success: false, message: e.message };
  }
}

/**
 * @version 1.0 - Controlla lo stato del pagamento di una quota per un associato in un dato anno.
 * @param {string} associateName Il nome completo dell'associato.
 * @param {number} year L'anno da controllare.
 * @returns {string|null} Restituisce la data del pagamento in formato "yyyy-MM-dd" se esiste, altrimenti null.
 */
function getQuotaStatus(associateName, year) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const quoteSheet = ss.getSheetByName(QUOTE_SHEET_NAME);
    if (!quoteSheet || quoteSheet.getLastRow() <= 1) {
      return null;
    }

    const quoteData = quoteSheet.getDataRange().getValues();
    const yearString = String(year);

    // Cerca una corrispondenza nel foglio delle quote
    for (let i = 1; i < quoteData.length; i++) {
      const row = quoteData[i];
      const nameInSheet = (row[0] || '').trim();
      const yearInSheet = (row[1] || '').toString().trim();

      if (nameInSheet === associateName && yearInSheet === yearString) {
        // Trovato! Restituisci la data formattata.
        return formatDateForInput(row[2]); 
      }
    }

    return null; // Nessuna corrispondenza trovata

  } catch (e) {
    Logger.log(`Errore in getQuotaStatus per ${associateName}, anno ${year}: ${e.message}`);
    return null; // In caso di errore, consideriamo la quota come non pagata
  }
}

/**
 * @version 1.0 - Calcola il prossimo numero associato disponibile.
 * @v_note Legge la colonna dei numeri, trova il massimo e lo incrementa.
 */
function getNextAssociateNumber() {
  Logger.log("Inizio calcolo prossimo numero associato.");
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);
    if (!sheet) {
      throw new Error(`Foglio "${ASSOCIATES_SHEET_NAME}" non trovato.`);
    }

    // Se il foglio è vuoto o ha solo l'intestazione, il primo numero è 1.
    if (sheet.getLastRow() < 2) {
      Logger.log("Foglio vuoto, il prossimo numero è 1.");
      return 1;
    }

    const rangeNum = sheet.getRange(2, COL_INDEX.NUMERO_ASSOCIATO + 1, sheet.getLastRow() - 1, 1);
    const valuesNum = rangeNum.getValues();

    const maxNum = valuesNum.reduce((max, row) => {
      const currentNum = parseInt(row[0], 10);
      return (!isNaN(currentNum) && currentNum > max) ? currentNum : max;
    }, 0); // Inizia da 0

    const nextNumber = maxNum + 1;
    Logger.log(`Numero massimo trovato: ${maxNum}. Prossimo numero: ${nextNumber}.`);
    return nextNumber;

  } catch (e) {
    Logger.log(`Errore GRAVE in getNextAssociateNumber: ${e.stack}`);
    throw new Error(`Impossibile calcolare il prossimo numero associato: ${e.message}`);
  }
}

/**
 * @version 1.0 - Analizza il foglio ASSOCIATI e trova i duplicati.
 * @v_note Identifica i duplicati per nome/cognome e crea un piano di unione, 
 * segnalando le fusioni automatiche e i conflitti da risolvere.
 * @returns {Array<Object>} Un array di "piani di risoluzione" per ogni gruppo di duplicati.
 */
function findDuplicateAssociates() {
  Logger.log("findDuplicateAssociates: Avvio analisi per trovare duplicati.");
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) {
      Logger.log("Foglio non trovato o vuoto. Nessuna operazione eseguita.");
      return [];
    }

    const allData = sheet.getDataRange().getValues();
    const headers = allData.shift(); // Rimuove e salva l'intestazione

    const associatesMap = new Map();
    allData.forEach((row, index) => {
      const nome = (row[COL_INDEX.NOME] || '').trim().toLowerCase();
      const cognome = (row[COL_INDEX.COGNOME] || '').trim().toLowerCase();
      
      if (!nome || !cognome) return; // Salta righe senza nome/cognome

      const fullNameKey = `${nome} ${cognome}`;
      const record = {
        rowNumber: index + 2, // Le righe sono 1-based e abbiamo rimosso l'header
        data: row
      };

      if (!associatesMap.has(fullNameKey)) {
        associatesMap.set(fullNameKey, []);
      }
      associatesMap.get(fullNameKey).push(record);
    });

    const resolutionPlans = [];
    const fieldsToCheck = [
      { name: 'dataIscrizione', index: COL_INDEX.DATA_ISCRIZIONE },
      { name: 'luogoNascita', index: COL_INDEX.LUOGO_NASCITA },
      { name: 'dataNascita', index: COL_INDEX.DATA_NASCITA },
      { name: 'indirizzo', index: COL_INDEX.INDIRIZZO },
      { name: 'codiceFiscale', index: COL_INDEX.CODICE_FISCALE },
      { name: 'cellulare', index: COL_INDEX.TELEFONO },
      { name: 'email', index: COL_INDEX.EMAIL },
      { name: 'telegramChatId', index: COL_INDEX.TELEGRAM_CHAT_ID }
      // Per semplicità iniziale, escludiamo i dati del tutore dalla fusione.
    ];

    for (const [fullName, records] of associatesMap.entries()) {
      if (records.length > 1) {
        Logger.log(`Trovato duplicato per: ${fullName} (${records.length} record).`);
        
        // Ordina per numero di riga, il primo sarà il "master"
        records.sort((a, b) => a.rowNumber - b.rowNumber);
        
        const masterRecord = records[0];
        const duplicateRecord = records[1]; // Per ora gestiamo solo coppie

        const plan = {
          fullName: `${masterRecord.data[COL_INDEX.NOME]} ${masterRecord.data[COL_INDEX.COGNOME]}`,
          master: { rowNumber: masterRecord.rowNumber, data: {} },
          duplicate: { rowNumber: duplicateRecord.rowNumber, data: {} },
          merges: [],
          conflicts: []
        };

        fieldsToCheck.forEach(field => {
          let masterValue = masterRecord.data[field.index];
          let duplicateValue = duplicateRecord.data[field.index];

          // Gestione speciale per le date
          if(field.name === 'dataIscrizione' || field.name === 'dataNascita'){
              masterValue = masterValue instanceof Date ? masterValue.toISOString() : masterValue;
              duplicateValue = duplicateValue instanceof Date ? duplicateValue.toISOString() : duplicateValue;
          }
          
          const masterStr = String(masterValue || '').trim();
          const duplicateStr = String(duplicateValue || '').trim();

          plan.master.data[field.name] = masterStr;
          plan.duplicate.data[field.name] = duplicateStr;

          if (masterStr && !duplicateStr) {
            // Nessuna azione, il master ha già il dato
          } else if (!masterStr && duplicateStr) {
            // Unione automatica: il duplicato ha un dato che il master non ha
            plan.merges.push({ field: field.name, value: duplicateStr });
          } else if (masterStr && duplicateStr && masterStr.toLowerCase() !== duplicateStr.toLowerCase()) {
            // Conflitto: entrambi hanno dati diversi
            plan.conflicts.push({ field: field.name, masterValue: masterStr, duplicateValue: duplicateStr });
          }
        });
        
        // Aggiungi il piano solo se ci sono azioni da compiere (unioni o conflitti)
        if (plan.merges.length > 0 || plan.conflicts.length > 0) {
          resolutionPlans.push(plan);
        }
      }
    }
    
    Logger.log(`Analisi completata. Trovati ${resolutionPlans.length} piani di risoluzione per duplicati.`);
    return resolutionPlans;

  } catch (e) {
    Logger.log(`Errore GRAVE in findDuplicateAssociates: ${e.stack}`);
    throw new Error(`Impossibile analizzare i duplicati: ${e.message}`);
  }
}

/**
 * @version 1.0 - Esegue la fusione di due record duplicati.
 * @v_note Aggiorna il record master con i dati scelti e cancella il record duplicato.
 * @param {Object} resolutionPlan Il piano di risoluzione approvato dall'utente.
 * @returns {Object} Un oggetto che conferma il successo dell'operazione.
 */
function executeMerge(resolutionPlan) {
  Logger.log(`executeMerge: Avvio fusione per "${resolutionPlan.fullName}".`);
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);

    const masterRowIndex = resolutionPlan.master.rowNumber;
    const duplicateRowIndex = resolutionPlan.duplicate.rowNumber;

    if (!masterRowIndex || !duplicateRowIndex) {
      throw new Error("Numeri di riga mancanti o non validi nel piano di risoluzione.");
    }

    // Mappa dei campi ai loro indici di colonna
    const fieldIndexMap = {
      dataIscrizione: COL_INDEX.DATA_ISCRIZIONE,
      luogoNascita: COL_INDEX.LUOGO_NASCITA,
      dataNascita: COL_INDEX.DATA_NASCITA,
      indirizzo: COL_INDEX.INDIRIZZO,
      codiceFiscale: COL_INDEX.CODICE_FISCALE,
      cellulare: COL_INDEX.TELEFONO,
      email: COL_INDEX.EMAIL,
      telegramChatId: COL_INDEX.TELEGRAM_CHAT_ID
    };

    // Applica le modifiche alla riga master
    resolutionPlan.updates.forEach(update => {
      const colIndex = fieldIndexMap[update.field];
      if (colIndex !== undefined) {
        let valueToSet = update.value;
        // Se il campo è una data, riconvertila da stringa ISO a oggetto Date
        if(update.field === 'dataIscrizione' || update.field === 'dataNascita'){
            valueToSet = new Date(valueToSet);
        }
        sheet.getRange(masterRowIndex, colIndex + 1).setValue(valueToSet);
        Logger.log(`Riga ${masterRowIndex}, campo "${update.field}": aggiornato con valore "${valueToSet}".`);
      }
    });
    
    // Elimina la riga duplicata (importante farlo dopo l'aggiornamento)
    sheet.deleteRow(duplicateRowIndex);
    Logger.log(`Riga duplicata ${duplicateRowIndex} eliminata con successo.`);

    return { success: true, message: `Record per "${resolutionPlan.fullName}" unito con successo.` };

  } catch (e) {
    Logger.log(`Errore GRAVE in executeMerge: ${e.stack}`);
    throw new Error(`Impossibile eseguire la fusione: ${e.message}`);
  }
}

/**
 * @version 1.0 - Funzione di supporto per trovare o creare un foglio di lavoro.
 * @param {Spreadsheet} ss L'oggetto Spreadsheet in cui operare.
 * @param {string} sheetName Il nome del foglio da trovare o creare.
 * @returns {Sheet} L'oggetto Sheet trovato o appena creato.
 */
function getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // Nasconde il foglio e imposta le intestazioni
    sheet.hideSheet();
    sheet.appendRow(['Token', 'EmailAssociato', 'DataScadenza']);
    Logger.log(`Foglio "${sheetName}" non trovato, creato e configurato.`);
  }
  return sheet;
}

/**
 * @version 1.3 (VERSIONE DI DEBUG) - Stampa il link di accesso nei log invece di inviarlo.
 * @v_note Questa versione è solo per test. Non invia email ma logga il magicLink per permettere i test
 * durante il blocco temporaneo dell'invio email da parte di Google.
 * @param {string} identifier L'identificativo fornito (email, CF o Nome Cognome).
 * @returns {Object} Un oggetto con un messaggio di successo che guida l'utente a controllare i log.
 */
function processLoginRequest(identifier) {
  Logger.log(`processLoginRequest (DEBUG MODE): Ricevuta richiesta con ID: "${identifier}"`);
  if (!identifier) {
    throw new Error("L'identificativo non può essere vuoto.");
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);
    if (sheet.getLastRow() < 2) {
      throw new Error("Nessun associato presente nel database.");
    }

    const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const identifierLower = identifier.toLowerCase().trim();
    
    const matches = allData.filter(row => {
      const email = String(row[COL_INDEX.EMAIL] || '').toLowerCase().trim();
      const cf = String(row[COL_INDEX.CODICE_FISCALE] || '').toLowerCase().trim();
      const fullName = String(`${(row[COL_INDEX.NOME] || '').trim()} ${(row[COL_INDEX.COGNOME] || '').trim()}`).toLowerCase();
      
      return email === identifierLower || cf === identifierLower || fullName === identifierLower;
    });

    if (matches.length === 0) {
      throw new Error("Nessun associato trovato con i dati forniti.");
    }
    if (matches.length > 1) {
      throw new Error("Sono stati trovati più associati. Usa un identificativo più specifico (es. Codice Fiscale).");
    }

    const associateRow = matches[0];
    const associateEmail = associateRow[COL_INDEX.EMAIL];

    if (!associateEmail) {
      throw new Error("L'associato trovato non ha un indirizzo email registrato.");
    }

    const token = Utilities.getUuid();
    const expirationDate = new Date(new Date().getTime() + 30 * 60 * 1000);

    const tokenSheet = getOrCreateSheet(ss, '_LOGIN_TOKENS');
    tokenSheet.appendRow([token, associateEmail, expirationDate]);

    const webAppUrl = ScriptApp.getService().getUrl();
    const magicLink = `${webAppUrl}?page=area-personale&token=${token}`; 

    // --- MODIFICA CHIAVE: STAMPA IL LINK NEI LOG ---
    Logger.log("!!! LINK DI ACCESSO (COPIA E INCOLLA NEL BROWSER) !!!");
    Logger.log(magicLink);
    Logger.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    
    return { success: true, message: "Link generato! Copialo dai log di esecuzione dello script." };

  } catch (e) {
    Logger.log(`Errore in processLoginRequest (DEBUG MODE): ${e.stack}`);
    throw new Error("Si è verificato un errore durante la generazione del link."); 
  }
}

/**
 * @version 1.1 - Aggiunge il destinatario in CC come test di deliverability.
 * @note Esegui questa funzione manualmente dall'editor.
 */
function testInvioEmail() {
  // --- MODIFICA QUESTA RIGA ---
  const TUO_INDIRIZZO_EMAIL = "andreoni.mauro@gmail.com"; 
  // -------------------------


  const subject = "Email di Test (v2) da Google Apps Script";
  const body = "Ciao,\n\nSe ricevi questa email, significa che il servizio MailApp del tuo script funziona correttamente quando il mittente è anche in CC.";

  try {
    // Oggetto opzioni avanzate con il campo 'cc'
    const options = {
      cc: TUO_INDIRIZZO_EMAIL
    };

    MailApp.sendEmail(TUO_INDIRIZZO_EMAIL, subject, body, options);
    Logger.log(`Email di test (con cc) inviata con successo a ${TUO_INDIRIZZO_EMAIL}.`);
  } catch (e) {
    Logger.log(`Errore durante l'invio dell'email di test (con cc): ${e.stack}`);
  }
}

/**
 * @version 1.1 - Aggiunge il recupero dei dati del tutore.
 * @v_note Ora, oltre ai dati dell'associato, recupera anche le informazioni del tutore,
 * sia che si tratti di un tutore associato o inserito manualmente.
 * @param {string} token Il token UUID da validare.
 * @returns {Object} Un oggetto contenente tutti i dati dell'associato, inclusi quelli del tutore.
 */
function validateTokenAndGetData(token) {
  Logger.log(`validateTokenAndGetData: Ricevuta richiesta di validazione per il token: ${token}`);
  if (!token) {
    throw new Error("Token non fornito. Accesso negato.");
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const tokenSheet = ss.getSheetByName('_LOGIN_TOKENS');
    
    if (!tokenSheet || tokenSheet.getLastRow() < 2) {
      throw new Error("Nessun token di accesso valido trovato. Il link potrebbe essere scaduto.");
    }

    const tokenData = tokenSheet.getDataRange().getValues();
    let tokenInfo = null;
    let tokenRowIndex = -1;

    for (let i = tokenData.length - 1; i >= 1; i--) {
      if (tokenData[i][0] === token) {
        tokenInfo = {
          token: tokenData[i][0],
          email: tokenData[i][1],
          expiration: new Date(tokenData[i][2])
        };
        tokenRowIndex = i + 1;
        break;
      }
    }

    if (!tokenInfo) {
      throw new Error("Token non valido. Potrebbe essere già stato usato o non essere mai esistito.");
    }

    if (new Date() > tokenInfo.expiration) {
      throw new Error("Token scaduto. Richiedi un nuovo link di accesso.");
    }

    tokenSheet.deleteRow(tokenRowIndex);
    Logger.log(`Token ${token} validato e rimosso con successo.`);

    const associatesSheet = ss.getSheetByName(ASSOCIATES_SHEET_NAME);
    const associatesData = associatesSheet.getDataRange().getValues();
    
    const associateRow = associatesData.find(row => (row[COL_INDEX.EMAIL] || '').toLowerCase() === tokenInfo.email.toLowerCase());

    if (!associateRow) {
      throw new Error("Impossibile trovare l'associato collegato a questo link di accesso.");
    }

    // --- INIZIO MODIFICA: Aggiunta Dati Tutore ---
    const associateDetails = {
      numero: associateRow[COL_INDEX.NUMERO_ASSOCIATO] || "",
      dataIscrizione: formatDateForInput(associateRow[COL_INDEX.DATA_ISCRIZIONE]),
      nome: associateRow[COL_INDEX.NOME] || "",
      cognome: associateRow[COL_INDEX.COGNOME] || "",
      luogoNascita: associateRow[COL_INDEX.LUOGO_NASCITA] || "",
      dataNascita: formatDateForInput(associateRow[COL_INDEX.DATA_NASCITA]),
      indirizzo: associateRow[COL_INDEX.INDIRIZZO] || "",
      codiceFiscale: associateRow[COL_INDEX.CODICE_FISCALE] || "",
      cellulare: associateRow[COL_INDEX.TELEFONO] || "",
      email: associateRow[COL_INDEX.EMAIL] || "",
      telegramChatId: associateRow[COL_INDEX.TELEGRAM_CHAT_ID] || "",
      // Dati del tutore
      nomeCompletoTutore: associateRow[COL_INDEX.NOME_COMPLETO_TUTORE] || "",
      tutoreNomeManuale: associateRow[COL_INDEX.TUTORE_NOME_MANUALE] || "",
      tutoreCognomeManuale: associateRow[COL_INDEX.TUTORE_COGNOME_MANUALE] || "",
      tutoreEmailManuale: associateRow[COL_INDEX.TUTORE_EMAIL_MANUALE] || ""
    };
    // --- FINE MODIFICA ---
    
    Logger.log(`Dati per ${associateDetails.email} (incluso tutore) recuperati con successo.`);
    return associateDetails;

  } catch (e) {
    Logger.log(`Errore in validateTokenAndGetData: ${e.stack}`);
    throw new Error(e.message);
  }
}

/**
 * @version 1.1 - Aggiunge la gestione completa dei dati del tutore.
 * @v_note Ora popola i campi del tutore e nasconde le etichette se i dati sono assenti,
 * sostituendo i segnaposto con stringhe vuote.
 * @param {Object} formData I dati del form compilati dall'associato.
 * @param {string} signatureDataUrl L'immagine della firma codificata in Base64.
 * @returns {Object} Un oggetto di successo con un messaggio per l'utente.
 */
function generateSignedModule(formData, signatureDataUrl) {
  Logger.log(`generateSignedModule: Avvio generazione per ${formData.email}`);
  try {
    const rootFolder = DriveApp.getFolderById(ROOT_ISCRIZIONI_FOLDER_ID);
    const associateFolderName = `${formData.cognome} ${formData.nome}`;
    const associateFolder = getOrCreateFolder(rootFolder, associateFolderName);
    
    const today = new Date();
    const formattedDate = Utilities.formatDate(today, Session.getScriptTimeZone(), 'dd/MM/yyyy');
    const currentYear = today.getFullYear();

    const quotaSettings = getQuotaSettings();
    const currentQuota = quotaSettings.find(q => q.year === currentYear);
    const quotaAmount = currentQuota ? `€${currentQuota.amount.toFixed(2)}` : 'N/D';

    const templateFile = DriveApp.getFileById(ISCRIZIONE_TEMPLATE_ID);
    const newFileName = `Modulo Iscrizione - ${associateFolderName}`;
    const newFile = templateFile.makeCopy(newFileName, associateFolder);
    const doc = DocumentApp.openById(newFile.getId());
    const body = doc.getBody();

    body.replaceText('{{NOME_COGNOME}}', `${formData.nome} ${formData.cognome}`);
    body.replaceText('{{LUOGO_NASCITA}}', formData.luogoNascita || '');
    body.replaceText('{{PROVINCIA_NASCITA}}', formData.provinciaNascita || ''); 
    body.replaceText('{{DATA_NASCITA}}', formData.dataNascita ? Utilities.formatDate(new Date(formData.dataNascita), Session.getScriptTimeZone(), 'dd/MM/yyyy') : '');
    body.replaceText('{{INDIRIZZO}}', formData.indirizzo || '');
    body.replaceText('{{CAP}}', formData.cap || '');
    body.replaceText('{{CITTA}}', formData.citta || '');
    body.replaceText('{{PROVINCIA_RESIDENZA}}', formData.provinciaResidenza || '');
    body.replaceText('{{CODICE_FISCALE}}', formData.codiceFiscale || '');
    body.replaceText('{{CELLULARE}}', formData.cellulare || '');
    body.replaceText('{{EMAIL}}', formData.email || '');
    body.replaceText('{{NUMERO_SOCIO}}', formData.numero || '');
    body.replaceText('{{QUOTA_ANNUALE}}', quotaAmount);
    body.replaceText('{{DATA_MODULO}}', formattedDate);
    
    // --- INIZIO MODIFICA GESTIONE TUTORE ---
    const nomeTutore = (formData.nomeTutore || '').trim();
    if (nomeTutore) {
        body.replaceText('{{NOME_TUTORE}}', nomeTutore);
        body.replaceText('{{EMAIL_TUTORE}}', formData.emailTutore || '');
        // Lascia le etichette fisse visibili
        body.replaceText('Tutore/Genitore', 'Tutore/Genitore');
        body.replaceText('Nome e Cognome', 'Nome e Cognome');
    } else {
        // Se non c'è tutore, nascondi tutto
        body.replaceText('{{NOME_TUTORE}}', '');
        body.replaceText('{{EMAIL_TUTORE}}', '');
        body.replaceText('Tutore/Genitore', '');
        body.replaceText('Nome e Cognome', '');
    }
    // --- FINE MODIFICA ---

    if (signatureDataUrl) {
      const signatureImageBlob = Utilities.newBlob(
        Utilities.base64Decode(signatureDataUrl.split(',')[1]),
        'image/png',
        'FIRMA.png'
      );
      associateFolder.createFile(signatureImageBlob);

      const signatureElement = body.findText('{{FIRMA}}');
      if (signatureElement) {
        const parent = signatureElement.getElement().getParent();
        parent.asParagraph().clear().insertInlineImage(0, signatureImageBlob).setWidth(150).setHeight(75);
      }
    } else {
       body.replaceText('{{FIRMA}}', 'Firma non apposta');
    }

    doc.saveAndClose();
    const pdfBlob = doc.getAs('application/pdf').setName(`${newFileName}.pdf`);
    const savedPdf = associateFolder.createFile(pdfBlob);

    DriveApp.getFileById(newFile.getId()).setTrashed(true);

    MailApp.sendEmail({
        to: formData.email,
        subject: `Copia del tuo Modulo d'Iscrizione - Associazione MusicPro`,
        body: `Ciao ${formData.nome},\n\nin allegato trovi la copia del modulo d'iscrizione che hai appena compilato e firmato.\n\nGrazie!\n\nAssociazione MusicPro`,
        attachments: [savedPdf],
        cc: ADMIN_EMAIL
    });

    Logger.log(`Modulo per ${formData.email} generato, salvato in Drive e inviato con successo.`);
    return { success: true, message: "Modulo generato e inviato con successo alla tua email!" };

  } catch (e) {
    Logger.log(`Errore GRAVE in generateSignedModule: ${e.stack}`);
    throw new Error(`Impossibile generare il modulo: ${e.message}`);
  }
}




