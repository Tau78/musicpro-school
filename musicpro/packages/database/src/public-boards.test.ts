import assert from "node:assert/strict";
import test from "node:test";

import {
  boardBookingWho,
  bookingPublicLabel,
  buildBoardRows,
  columnValue,
  defaultTimetableColumns,
  occupancyForRooms,
  parseBoardColumns,
  rowsForScreen,
  sampleBoardCells,
  sliceBoardPages,
  soloLabel,
  studentPublicLabel,
  type BoardLessonSource,
} from "./public-boards";

const WINTER_EVENING = "2026-01-02T17:00:00.000Z";

function lesson(overrides: Partial<BoardLessonSource> = {}): BoardLessonSource {
  return {
    startsAt: WINTER_EVENING,
    endsAt: "2026-01-02T18:00:00.000Z",
    durationMinutes: 60,
    courseName: "Analisi",
    courseKind: "gruppo",
    subjectName: "Archeologia",
    teacherFirst: "Luca",
    teacherLast: "Verdi",
    roomName: "Sala 1",
    students: [{ first: "Mario", last: "Rossi" }],
    enrolledCount: 8,
    note: "",
    siteLabel: "MusicPro",
    who: "",
    instrument: "",
    microphones: "",
    solo: "",
    ...overrides,
  };
}

test("sul tabellone l'individuale mostra nome e iniziale", () => {
  assert.equal(studentPublicLabel("Mario", "Rossi"), "Mario R.");
  assert.equal(studentPublicLabel("  Anna ", ""), "Anna");
  assert.equal(
    columnValue(
      "course",
      lesson({ courseKind: "individuale", courseName: "Pianoforte" }),
    ),
    "Mario R.",
  );
  assert.equal(columnValue("course", lesson()), "Analisi");
});

test("data e ora sono quelle di Roma", () => {
  const row = lesson();
  assert.equal(columnValue("start_date", row), "02/01");
  assert.equal(columnValue("start_time", row), "18:00");
  assert.equal(columnValue("teacher_alias", row), "Verdi");
});

test("la riga unisce lezione e prenotazione sala", () => {
  const individual = lesson({ courseKind: "individuale", courseName: "Pianoforte" });
  assert.equal(columnValue("who", individual), "Mario R.");
  assert.equal(columnValue("instrument", individual), "Archeologia");
  assert.equal(columnValue("microphones", individual), "");
  assert.equal(columnValue("solo", individual), "");

  const booking = lesson({
    roomName: "Sala 2",
    courseName: "",
    courseKind: "gruppo",
    subjectName: "",
    students: [],
    who: "I Gatti",
    instrument: "",
    microphones: "3",
    solo: "No",
  });
  assert.equal(columnValue("who", booking), "I Gatti");
  assert.equal(columnValue("instrument", booking), "");
  assert.equal(columnValue("microphones", booking), "3");
  assert.equal(columnValue("solo", booking), "No");
  assert.equal(boardBookingWho("I Gatti", "Mario", "Rossi"), "I Gatti");
  assert.equal(boardBookingWho(null, "Mario", "Rossi"), "Mario R.");
  assert.equal(soloLabel(true), "Sì");
  assert.equal(soloLabel(false), "No");
});

test("un titolo che contiene il cognome non finisce sul tabellone", () => {
  assert.equal(bookingPublicLabel("Rossi trio", "Mario", "Rossi"), "Mario R.");
  assert.equal(bookingPublicLabel("Prove band", "Mario", "Rossi"), "Prove band");
  assert.equal(bookingPublicLabel("", "Mario", "Rossi"), "Mario R.");
});

test("le colonne si leggono nell'ordine salvato", () => {
  const columns = defaultTimetableColumns().slice(0, 3);
  const [row] = buildBoardRows([{ ...lesson(), id: "a" }], columns);
  assert.deepEqual(row?.cells, ["02/01", "18:00", "60"]);
});

test("la preview segue il flag individuali", () => {
  const columns = defaultTimetableColumns().filter((column) => column.key === "course");
  assert.equal(sampleBoardCells(columns, "MusicPro", true)[0], "Mario R.");
  assert.equal(sampleBoardCells(columns, "MusicPro", false)[0], "Analisi");
});

test("le lezioni finite escono, la pagina rispetta il numero di righe", () => {
  const rows = [
    { id: "a", endsAt: "2026-01-02T16:00:00.000Z" },
    { id: "b", endsAt: "2026-01-02T18:00:00.000Z" },
    { id: "c", endsAt: "2026-01-02T19:00:00.000Z" },
  ];
  const now = Date.parse("2026-01-02T17:30:00.000Z");
  assert.deepEqual(
    rowsForScreen(rows, now, 7).map((row) => row.id),
    ["b", "c"],
  );
  assert.equal(sliceBoardPages([1, 2, 3, 4, 5], 2).length, 3);
  assert.deepEqual(
    rowsForScreen([rows[0]!], Date.parse("2026-01-02T20:00:00.000Z"), 7).map(
      (row) => row.id,
    ),
    ["a"],
  );
});

test("una colonna sconosciuta non entra nel tabellone", () => {
  const parsed = parseBoardColumns([
    { key: "nope", boardLabel: "X", listLabel: "X" },
    { key: "room", boardLabel: "Aula", listLabel: "Aula" },
  ]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.key, "room");
  assert.equal(parseBoardColumns([]).length, defaultTimetableColumns().length);
});

test("l'occupazione distingue la sala libera da quella in corso", () => {
  const now = Date.parse("2026-01-02T17:30:00.000Z");
  const cards = occupancyForRooms(
    [
      { id: "sala", name: "Sala 1" },
      { id: "vuota", name: "Sala 2" },
    ],
    [
      {
        roomId: "sala",
        startsAt: WINTER_EVENING,
        endsAt: "2026-01-02T18:00:00.000Z",
        label: "Mario R.",
      },
      {
        roomId: "sala",
        startsAt: "2026-01-02T18:00:00.000Z",
        endsAt: "2026-01-02T19:00:00.000Z",
        label: "Analisi",
      },
    ],
    now,
  );
  assert.equal(cards[0]?.state, "occupata");
  assert.equal(cards[0]?.nowLabel, "Mario R.");
  assert.equal(cards[0]?.nextLabel, "Analisi");
  assert.equal(cards[1]?.state, "libera");
  assert.equal(cards[1]?.nowLabel, "Libera");
});
