import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SCHOOL_PRODUCTION_ORIGIN,
  internalAppUrl,
  isLocalDevOrigin,
  isLocalEdgeRuntime,
  publicSchoolUrl,
} from './public-url.ts';

test('isLocalDevOrigin riconosce localhost e 127.0.0.1', () => {
  assert.equal(isLocalDevOrigin('http://localhost:3000'), true);
  assert.equal(isLocalDevOrigin('http://127.0.0.1:3000'), true);
  assert.equal(isLocalDevOrigin(SCHOOL_PRODUCTION_ORIGIN), false);
});

test('publicSchoolUrl ignora env localhost e usa produzione', () => {
  assert.equal(
    publicSchoolUrl({
      BOOKING_EMAIL_APP_URL: 'http://localhost:3000',
      SCHOOL_PUBLIC_URL: 'http://127.0.0.1:3000',
      SITE_URL: 'http://localhost:3000',
    }),
    SCHOOL_PRODUCTION_ORIGIN,
  );
  assert.equal(publicSchoolUrl({}), SCHOOL_PRODUCTION_ORIGIN);
  assert.equal(
    publicSchoolUrl({ SCHOOL_PUBLIC_URL: 'https://preview.example.it/' }),
    'https://preview.example.it',
  );
});

test('internalAppUrl in cloud scarta SITE_URL localhost', () => {
  assert.equal(
    internalAppUrl({
      SITE_URL: 'http://localhost:3000',
      SUPABASE_URL: 'https://xyzcompany.supabase.co',
    }),
    SCHOOL_PRODUCTION_ORIGIN,
  );
});

test('internalAppUrl in locale accetta localhost', () => {
  assert.equal(
    isLocalEdgeRuntime({ SUPABASE_URL: 'http://127.0.0.1:54321' }),
    true,
  );
  assert.equal(
    internalAppUrl({
      SITE_URL: 'http://localhost:3000',
      SUPABASE_URL: 'http://127.0.0.1:54321',
    }),
    'http://localhost:3000',
  );
});
