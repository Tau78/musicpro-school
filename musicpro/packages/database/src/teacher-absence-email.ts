/** Email assenza docente: stile MusicPro (navy / gold / paper). */

const NAVY = "#1e3a5f";
const GOLD = "#c9a227";
const INK = "#1c2834";
const MUTED = "#5c6b7a";
const PAPER = "#f4f1ea";
const CARD = "#ffffff";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type TeacherAbsenceEmailLessonLine = {
  courseName: string;
  originalWhen: string;
  originalRoom: string | null;
  newWhen?: string | null;
  newRoom?: string | null;
};

export type TeacherAbsenceEmailInput = {
  kind: "cancelled" | "moved";
  periodLabel: string;
  /** Solo destinatari segreteria. */
  teacherName?: string | null;
  lessons: TeacherAbsenceEmailLessonLine[];
  audience: "staff" | "family";
};

function lessonTextLine(
  line: TeacherAbsenceEmailLessonLine,
  kind: TeacherAbsenceEmailInput["kind"],
): string {
  const course = line.courseName.trim() || "Corso";
  const origRoom = line.originalRoom?.trim();
  const orig =
    origRoom
      ? `${line.originalWhen} (${origRoom})`
      : line.originalWhen;
  if (kind === "cancelled") {
    return `• ${course}: ${orig}`;
  }
  const newRoom = line.newRoom?.trim();
  const dest =
    line.newWhen && newRoom
      ? `${line.newWhen} (${newRoom})`
      : line.newWhen ?? "—";
  return `• ${course}: da ${orig} → ${dest}`;
}

function lessonHtmlRow(
  line: TeacherAbsenceEmailLessonLine,
  kind: TeacherAbsenceEmailInput["kind"],
): string {
  const course = escapeHtml(line.courseName.trim() || "Corso");
  const origRoom = line.originalRoom?.trim();
  const orig = escapeHtml(
    origRoom ? `${line.originalWhen} (${origRoom})` : line.originalWhen,
  );
  if (kind === "cancelled") {
    return `<tr>
      <td style="padding:10px 0;border-top:1px solid #e6dcc4;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;color:${INK};">
        <strong style="color:${NAVY};">${course}</strong><br />
        <span style="color:${MUTED};font-size:14px;">${orig}</span>
      </td>
    </tr>`;
  }
  const newRoom = line.newRoom?.trim();
  const dest = escapeHtml(
    line.newWhen && newRoom
      ? `${line.newWhen} (${newRoom})`
      : line.newWhen ?? "—",
  );
  return `<tr>
    <td style="padding:10px 0;border-top:1px solid #e6dcc4;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;color:${INK};">
      <strong style="color:${NAVY};">${course}</strong><br />
      <span style="color:${MUTED};font-size:14px;">Da ${orig}</span><br />
      <span style="color:${NAVY};font-size:14px;">→ ${dest}</span>
    </td>
  </tr>`;
}

export function renderTeacherAbsenceEmail(
  input: TeacherAbsenceEmailInput,
): { subject: string; text: string; html: string } {
  const subject =
    input.kind === "cancelled"
      ? "Assenza docente — lezioni annullate"
      : "Assenza docente — lezioni spostate";

  const introMoved =
    input.kind === "moved"
      ? "per assenza del docente le seguenti lezioni sono state spostate:"
      : "per assenza del docente le seguenti lezioni sono state annullate:";

  const introCancelled =
    input.kind === "cancelled"
      ? "per assenza del docente le seguenti lezioni sono state annullate:"
      : introMoved;

  const teacher = input.teacherName?.trim();
  const staffNote =
    input.audience === "staff" && input.kind === "cancelled"
      ? "\n\nLe lezioni annullate non vanno in compenso docente."
      : "";
  const staffLead =
    input.audience === "staff" && teacher
      ? `Il docente ${teacher} ha segnato assenza nel periodo ${input.periodLabel}. `
      : `Nel periodo ${input.periodLabel} `;

  const textLines = [
    "Ciao,",
    "",
    `${staffLead}${introCancelled}`,
    "",
    ...input.lessons.map((line) => lessonTextLine(line, input.kind)),
    staffNote,
    "",
    "MusicPro School",
  ].filter((line, index, arr) => line !== "" || arr[index - 1] !== "");

  const headline =
    input.kind === "cancelled" ? "Lezioni annullate" : "Lezioni spostate";
  const bodyLead = `${staffLead}${introCancelled}`;

  const rowsHtml = input.lessons
    .map((line) => lessonHtmlRow(line, input.kind))
    .join("");
  const staffNoteHtml =
    input.audience === "staff" && input.kind === "cancelled"
      ? `<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${INK};">Le lezioni annullate non vanno in compenso docente.</p>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAPER};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${PAPER}" style="background-color:${PAPER};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background-color:${CARD};">
          <tr><td bgcolor="${GOLD}" style="background-color:${GOLD};height:6px;font-size:0;">&nbsp;</td></tr>
          <tr>
            <td bgcolor="${NAVY}" style="background-color:${NAVY};padding:22px 28px 18px;">
              <p style="margin:0;font-family:Georgia,serif;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD};">MusicPro School</p>
              <p style="margin:8px 0 0;font-family:Georgia,serif;font-size:24px;line-height:1.25;color:#ffffff;">${escapeHtml(headline)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:${INK};">
              Ciao,<br /><br />
              ${escapeHtml(bodyLead)}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rowsHtml}</table>
              ${staffNoteHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:22px 28px 26px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${MUTED};">
              A presto,<br />MusicPro School
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text: textLines.join("\n"), html };
}
