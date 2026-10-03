import assert from "node:assert/strict";
import test from "node:test";

import {
  bookingBelongsToUser,
  buildImportedBookingRow,
  buildImportNote,
  canonicalRoomKey,
  supersaasRoomKey,
  musicProOccupiesSlot,
  parsePriceEur,
  parseSuperSaasDateTime,
  planSuperSaasImport,
  redactSecrets,
  userMatchesEmail,
} from "./supersaas-bookings.mjs";

const rooms = [
  { id: "room-rossa", name: "Rossa" },
  { id: "room-verde", name: "Sala Verde" },
  { id: "room-arancio", name: "Arancio" },
];

function roomsByKey() {
  return new Map([
    ["rossa", rooms[0]],
    ["verde", rooms[1]],
    ["arancio", rooms[2]],
  ]);
}

function booking(overrides) {
  return {
    externalId: "100",
    resourceId: "1",
    resourceName: "Rossa",
    startMs: Date.parse("2026-10-10T16:00:00.000Z"),
    endMs: Date.parse("2026-10-10T18:00:00.000Z"),
    priceEur: 20,
    note: "Origine: SuperSaaS #100",
    active: true,
    ...overrides,
  };
}

test("ora solare Europe/Rome: CET è UTC+1", () => {
  const parsed = parseSuperSaasDateTime("2026-01-15 10:00:00");
  assert.equal(parsed.toISOString(), "2026-01-15T09:00:00.000Z");
});

test("ora legale Europe/Rome: CEST è UTC+2", () => {
  const parsed = parseSuperSaasDateTime("2026-07-15 10:00:00");
  assert.equal(parsed.toISOString(), "2026-07-15T08:00:00.000Z");
});

test("il buco dell'ora legale non viene spostato in silenzio", () => {
  assert.throws(
    () => parseSuperSaasDateTime("2026-03-29 02:30:00"),
    /ora legale/,
  );
});

test("l'ora ambigua di fine ora legale resta un istante reale di Roma", () => {
  const parsed = parseSuperSaasDateTime("2026-10-25 02:30:00");
  assert.equal(parsed.toISOString(), "2026-10-25T01:30:00.000Z");
});

test("un offset esplicito non viene riletto come ora di Roma", () => {
  const parsed = parseSuperSaasDateTime("2026-07-15T10:00:00+02:00");
  assert.equal(parsed.toISOString(), "2026-07-15T08:00:00.000Z");
});

test("mappa Rossa, Verde e Arancio e rifiuta le altre", () => {
  assert.equal(canonicalRoomKey("Sala Rossa"), "rossa");
  assert.equal(canonicalRoomKey("VERDE"), "verde");
  assert.equal(canonicalRoomKey("sala arancione"), "arancio");
  assert.equal(canonicalRoomKey("Rossa 2h"), "rossa");
  assert.equal(canonicalRoomKey("Arancio 2,5h"), "arancio");
  assert.equal(canonicalRoomKey("Sala 4"), null);
  assert.equal(canonicalRoomKey("Blu 1h"), null);
  assert.equal(supersaasRoomKey("Blu 1h"), "verde");
  assert.equal(supersaasRoomKey("Sala Blu 2,5h"), "verde");
  assert.equal(supersaasRoomKey("Rossa 2h"), "rossa");
});

test("le note tengono origine e id e tolgono email e telefono", () => {
  const note = buildImportNote(
    "55",
    "Prova con serenabottari85@gmail.com e tel +39 333 123 4567",
  );
  assert.match(note, /Origine: SuperSaaS #55/);
  assert.doesNotMatch(note, /@/);
  assert.doesNotMatch(note, /333/);
});

test("la chiave non resta nei messaggi di errore", () => {
  const secret = "super-secret-api-key-value";
  const redacted = redactSecrets(
    `fallito ${secret} url?api_key=${secret}&account=MusicPro`,
    [secret],
  );
  assert.equal(redacted.includes(secret), false);
  assert.match(redacted, /api_key=\[redacted\]/);
});

test("idempotenza: lo stesso id SuperSaaS è un duplicato", () => {
  const row = booking({ externalId: "77" });
  const plan = planSuperSaasImport({
    memberBookings: [row],
    mirrorSource: [row],
    roomsByKey: roomsByKey(),
    importedExternalIds: new Set(["77"]),
    occupying: [],
    nowMs: Date.parse("2026-10-01T00:00:00.000Z"),
  });
  assert.equal(plan.rows[0].kind, "duplicate");
  assert.equal(plan.summary.duplicate, 1);
  assert.equal(plan.summary.importabili, 0);
  assert.equal(plan.mirror.length, 0);
});

test("conflitto con una prenotazione MusicPro che occupa lo slot", () => {
  const row = booking({});
  const plan = planSuperSaasImport({
    memberBookings: [row],
    mirrorSource: [row],
    roomsByKey: roomsByKey(),
    importedExternalIds: new Set(),
    occupying: [
      {
        id: "mp-1",
        roomId: "room-rossa",
        externalId: null,
        startMs: Date.parse("2026-10-10T17:00:00.000Z"),
        endMs: Date.parse("2026-10-10T19:00:00.000Z"),
      },
    ],
    nowMs: Date.parse("2026-10-01T00:00:00.000Z"),
  });
  assert.equal(plan.rows[0].kind, "conflict");
  assert.equal(plan.summary.inConflitto, 1);
});

test("un checkout non pagato non è un conflitto e lo slot adiacente è libero", () => {
  assert.equal(
    musicProOccupiesSlot({
      status: "pending",
      payment_status: "unpaid",
      credits_held: 0,
    }),
    false,
  );
  assert.equal(
    musicProOccupiesSlot({
      status: "confirmed",
      payment_status: "not_required",
      credits_held: 0,
    }),
    true,
  );
  const row = booking({
    endMs: Date.parse("2026-10-10T18:00:00.000Z"),
  });
  const plan = planSuperSaasImport({
    memberBookings: [row],
    mirrorSource: [row],
    roomsByKey: roomsByKey(),
    importedExternalIds: new Set(),
    occupying: [
      {
        id: "mp-touch",
        roomId: "room-rossa",
        externalId: null,
        startMs: Date.parse("2026-10-10T18:00:00.000Z"),
        endMs: Date.parse("2026-10-10T20:00:00.000Z"),
      },
    ],
    nowMs: Date.parse("2026-10-01T00:00:00.000Z"),
  });
  assert.equal(plan.rows[0].kind, "importable");
});

test("una risorsa sconosciuta blocca l'import e lo specchio", () => {
  const mine = booking({ externalId: "1", resourceName: "Rossa" });
  const other = booking({
    externalId: "2",
    resourceName: "Sala Gialla",
    startMs: Date.parse("2026-10-11T16:00:00.000Z"),
    endMs: Date.parse("2026-10-11T18:00:00.000Z"),
  });
  const plan = planSuperSaasImport({
    memberBookings: [mine],
    mirrorSource: [mine, other],
    roomsByKey: roomsByKey(),
    importedExternalIds: new Set(),
    occupying: [],
    nowMs: Date.parse("2026-10-01T00:00:00.000Z"),
  });
  assert.equal(plan.blocked, true);
  assert.deepEqual(plan.unknownResources, ["Sala Gialla"]);
  assert.equal(plan.mirror.length, 0);
  assert.equal(plan.rows[0].kind, "error");
  assert.equal(plan.summary.importabili, 0);
});

test("la sala Blu di SuperSaaS occupa la sala Verde", () => {
  const row = booking({ externalId: "8", resourceName: "Blu 2h" });
  const plan = planSuperSaasImport({
    memberBookings: [row],
    mirrorSource: [row],
    roomsByKey: roomsByKey(),
    importedExternalIds: new Set(),
    occupying: [],
    nowMs: Date.parse("2026-10-01T00:00:00.000Z"),
  });
  assert.equal(plan.blocked, false);
  assert.equal(plan.rows[0].kind, "importable");
  assert.equal(plan.rows[0].roomId, "room-verde");
  assert.equal(plan.rows[0].roomName, "Sala Verde");
});

test("lo specchio anonimo tiene gli altri slot e non il duplicato già importato", () => {
  const mine = booking({ externalId: "1" });
  const other = booking({
    externalId: "2",
    resourceName: "Verde",
    startMs: Date.parse("2026-10-11T16:00:00.000Z"),
    endMs: Date.parse("2026-10-11T17:00:00.000Z"),
  });
  const plan = planSuperSaasImport({
    memberBookings: [mine],
    mirrorSource: [mine, other],
    roomsByKey: roomsByKey(),
    importedExternalIds: new Set(["9"]),
    occupying: [],
    nowMs: Date.parse("2026-10-01T00:00:00.000Z"),
  });
  assert.equal(plan.blocked, false);
  assert.equal(plan.rows[0].kind, "importable");
  assert.deepEqual(
    plan.mirror.map((row) => row.external_id).sort(),
    ["1", "2"],
  );
  assert.equal("member_id" in plan.mirror[0], false);
});

test("due prenotazioni SuperSaaS sulla stessa sala sono in conflitto", () => {
  const mine = booking({ externalId: "1" });
  const other = booking({ externalId: "2", resourceName: "Rossa" });
  const plan = planSuperSaasImport({
    memberBookings: [mine],
    mirrorSource: [mine, other],
    roomsByKey: roomsByKey(),
    importedExternalIds: new Set(),
    occupying: [],
    nowMs: Date.parse("2026-10-01T00:00:00.000Z"),
  });
  assert.equal(plan.rows[0].kind, "conflict");
});

test("data o durata non valide non sono importabili", () => {
  const row = booking({
    endMs: Date.parse("2026-10-10T16:00:00.000Z"),
  });
  const plan = planSuperSaasImport({
    memberBookings: [row],
    mirrorSource: [{ ...row, endMs: row.startMs + 60 * 60 * 1000, active: true }],
    roomsByKey: roomsByKey(),
    importedExternalIds: new Set(),
    occupying: [],
    nowMs: Date.parse("2026-10-01T00:00:00.000Z"),
  });
  assert.equal(plan.rows[0].kind, "error");
  assert.match(plan.rows[0].reason, /durata|data/);
});

test("l'import non chiede un pagamento e non mette un metodo", () => {
  const row = booking({ priceEur: 15, note: buildImportNote("100", "solo testo") });
  const plan = planSuperSaasImport({
    memberBookings: [row],
    mirrorSource: [row],
    roomsByKey: roomsByKey(),
    importedExternalIds: new Set(),
    occupying: [],
    nowMs: Date.parse("2026-10-01T00:00:00.000Z"),
  });
  const insert = buildImportedBookingRow({
    memberId: "member-1",
    row: plan.rows[0],
  });
  assert.equal(insert.status, "confirmed");
  assert.equal(insert.payment_status, "not_required");
  assert.equal(insert.payment_method, null);
  assert.equal(insert.credits_held, 0);
  assert.equal(insert.external_source, "supersaas");
  assert.equal(insert.external_id, "100");
  assert.equal(insert.paid_at, null);
  assert.equal(insert.stripe_payment_intent_id, null);
});

test("il prezzo con virgola è in euro e un negativo si scarta", () => {
  assert.equal(parsePriceEur("12,50"), 12.5);
  assert.equal(parsePriceEur(-1), null);
});

test("il prezzo intero SuperSaaS è in centesimi", () => {
  assert.equal(parsePriceEur(3000), 30);
  assert.equal(parsePriceEur(3750), 37.5);
  assert.equal(parsePriceEur("2000"), 20);
});

test("una prenotazione non viene attribuita a un'altra email", () => {
  const user = { id: 9, email: "serenabottari85@gmail.com" };
  assert.equal(userMatchesEmail(user, "SerenaBottari85@gmail.com"), true);
  assert.equal(
    bookingBelongsToUser({ user_id: 9, email: "altro@example.com" }, user, user.email),
    true,
  );
  assert.equal(
    bookingBelongsToUser(
      { user_id: 3, email: "altro@example.com", full_name: "Serena" },
      user,
      user.email,
    ),
    false,
  );
});

test("una prenotazione cancellata non entra nell'import né nello specchio", () => {
  const row = booking({ externalId: "3", active: false });
  const plan = planSuperSaasImport({
    memberBookings: [row],
    mirrorSource: [row],
    roomsByKey: roomsByKey(),
    importedExternalIds: new Set(),
    occupying: [],
    nowMs: Date.parse("2026-10-01T00:00:00.000Z"),
  });
  assert.equal(plan.rows.length, 0);
  assert.equal(plan.mirror.length, 0);
});

test("una prenotazione già iniziata non entra nell'import", () => {
  const row = booking({
    startMs: Date.parse("2026-10-01T09:00:00.000Z"),
    endMs: Date.parse("2026-10-01T11:00:00.000Z"),
  });
  const plan = planSuperSaasImport({
    memberBookings: [row],
    mirrorSource: [row],
    roomsByKey: roomsByKey(),
    importedExternalIds: new Set(),
    occupying: [],
    nowMs: Date.parse("2026-10-01T10:00:00.000Z"),
  });
  assert.equal(plan.rows.length, 0);
  assert.equal(plan.mirror.length, 1);
});
