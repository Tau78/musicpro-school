#!/usr/bin/env node
/**
 * One-time migration: Google Sheets → Supabase PostgreSQL
 * Idempotent — safe to re-run (upserts on unique keys).
 */

const path = require('path');

// Root .env first, then musicpro/.env (where Supabase + Google credentials live)
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../musicpro/.env') });

const { migrateMembers } = require('./mappers/members');
const { migrateReimbursements } = require('./mappers/reimbursements');
const { migrateEnrollments } = require('./mappers/enrollments');
const { migrateQuotas } = require('./mappers/quotas');
const { migrateTemplates } = require('./mappers/templates');
const { logSheetSummary } = require('./utils');
const {
  ASSOCIATES_SHEET_NAME,
  LOG_SHEET_NAME,
  ISCRIZIONI_SHEET_NAME,
  SETTINGS_SHEET_NAME,
  QUOTE_SHEET_NAME,
  TEMPLATE_SHEET_NAME,
} = require('./config');

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run') || argv.includes('-n');
  const only = [];
  for (const arg of argv) {
    if (arg.startsWith('--only=')) {
      only.push(...arg.slice(7).split(',').map((s) => s.trim()).filter(Boolean));
    }
  }
  return { dryRun, only };
}

function validateEnv() {
  const missing = [];
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) missing.push('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

async function main() {
  const { dryRun, only } = parseArgs(process.argv.slice(2));
  validateEnv();
  const started = Date.now();

  console.log('MusicPro School — Google Sheets → Supabase migration');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
  if (only.length) console.log(`Scope: ${only.join(', ')}`);
  console.log('');

  const steps = [
    {
      key: 'members',
      label: ASSOCIATES_SHEET_NAME,
      run: () => migrateMembers(dryRun),
    },
    {
      key: 'quotas',
      label: `${SETTINGS_SHEET_NAME} + ${QUOTE_SHEET_NAME}`,
      run: async () => {
        const result = await migrateQuotas(dryRun);
        logSheetSummary(SETTINGS_SHEET_NAME, result.settings);
        logSheetSummary(`${QUOTE_SHEET_NAME} (+ ASSOCIATI legacy cols)`, result.memberQuotas);
        return result;
      },
    },
    {
      key: 'reimbursements',
      label: LOG_SHEET_NAME,
      run: () => migrateReimbursements(dryRun),
    },
    {
      key: 'enrollments',
      label: ISCRIZIONI_SHEET_NAME,
      run: () => migrateEnrollments(dryRun),
    },
    {
      key: 'templates',
      label: TEMPLATE_SHEET_NAME,
      run: () => migrateTemplates(dryRun),
    },
  ];

  const active = only.length
    ? steps.filter((s) => only.includes(s.key))
    : steps;

  if (!active.length) {
    console.error(
      'No matching steps. Valid --only values: members, quotas, reimbursements, enrollments, templates'
    );
    process.exit(1);
  }

  let hadErrors = false;

  for (const step of active) {
    try {
      const result = await step.run();
      if (step.key !== 'quotas') {
        logSheetSummary(step.label, result);
      }
      const errors =
        step.key === 'quotas'
          ? [...result.settings.errors, ...result.memberQuotas.errors]
          : result.errors;
      if (errors.length) hadErrors = true;
    } catch (err) {
      hadErrors = true;
      console.error(`\nFATAL ${step.label}: ${err.message}`);
      if (err.stack) console.error(err.stack);
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s${dryRun ? ' (dry run — no data written)' : ''}.`);
  process.exit(hadErrors ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
