const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { SPREADSHEET_ID } = require('./config');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

let sheetsClient = null;

function loadServiceAccountCredentials() {
  const jsonPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!jsonPath) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is required (path to service account JSON)');
  }
  const resolved = path.resolve(jsonPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Service account file not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  return JSON.parse(raw);
}

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const credentials = loadServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES,
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

/**
 * @param {string} sheetName
 * @param {string} [rangeSuffix] e.g. 'A:Z' — defaults to full used range
 * @returns {Promise<{ header: string[], rows: string[][], sheetTitle: string }>}
 */
async function readSheet(sheetName, rangeSuffix) {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID || SPREADSHEET_ID;
  const range = rangeSuffix ? `'${sheetName}'!${rangeSuffix}` : `'${sheetName}'`;

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });

  const exists = (meta.data.sheets || []).some(
    (s) => s.properties && s.properties.title === sheetName
  );
  if (!exists) {
    return { header: [], rows: [], sheetTitle: sheetName, missing: true };
  }

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });

  const values = response.data.values || [];
  if (values.length === 0) {
    return { header: [], rows: [], sheetTitle: sheetName };
  }

  const [header, ...rows] = values;
  return {
    header: header.map((c) => String(c ?? '')),
    rows,
    sheetTitle: sheetName,
  };
}

/**
 * Read ASSOCIATI including wide quote columns (col S onwards).
 */
async function readAssociatesSheet() {
  return readSheet('ASSOCIATI');
}

module.exports = {
  getSheetsClient,
  readSheet,
  readAssociatesSheet,
};
