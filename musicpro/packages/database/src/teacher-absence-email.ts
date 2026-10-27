/** Email assenza docente — guscio MusicPro School (wrapSchoolEmail). */

import {
  escapeEmailHtml,
  schoolEmailTextFooter,
  SCHOOL_APP_URL,
  SCHOOL_BRAND_NAVY,
  wrapSchoolEmail,
} from "@musicpro/shared";

const INK = "#1c2834";
const MUTED = "#5c6b7a";

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
  const course = escapeEmailHtml(line.courseName.trim() || "Corso");
  const origRoom = line.originalRoom?.trim();
  const orig = escapeEmailHtml(
    origRoom ? `${line.originalWhen} (${origRoom})` : line.originalWhen,
  );
  if (kind === "cancelled") {
    return `<tr>
      <td style="padding:10px 0;border-top:1px solid #e6dcc4;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;color:${INK};">
        <strong style="color:${SCHOOL_BRAND_NAVY};">${course}</strong><br />
        <span style="color:${MUTED};font-size:14px;">${orig}</span>
      </td>
    </tr>`;
  }
  const newRoom = line.newRoom?.trim();
  const dest = escapeEmailHtml(
    line.newWhen && newRoom
      ? `${line.newWhen} (${newRoom})`
      : line.newWhen ?? "—",
  );
  return `<tr>
    <td style="padding:10px 0;border-top:1px solid #e6dcc4;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;color:${INK};">
      <strong style="color:${SCHOOL_BRAND_NAVY};">${course}</strong><br />
      <span style="color:${MUTED};font-size:14px;">Da ${orig}</span><br />
      <span style="color:${SCHOOL_BRAND_NAVY};font-size:14px;">→ ${dest}</span>
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

  const bodyLead = `${staffLead}${introCancelled}`;
  const showAppDownload = input.audience === "family";

  const textLines = [
    "Ciao,",
    "",
    bodyLead,
    "",
    ...input.lessons.map((line) => lessonTextLine(line, input.kind)),
    staffNote,
  ].filter((line, index, arr) => line !== "" || arr[index - 1] !== "");

  const text =
    textLines.join("\n") +
    schoolEmailTextFooter({ showAppDownload });

  const headline =
    input.kind === "cancelled" ? "Lezioni annullate" : "Lezioni spostate";

  const rowsHtml = input.lessons
    .map((line) => lessonHtmlRow(line, input.kind))
    .join("");
  const staffNoteHtml =
    input.audience === "staff" && input.kind === "cancelled"
      ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:${INK};">Le lezioni annullate non vanno in compenso docente.</p>`
      : "";

  const htmlBody = `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1a1a1a;">Ciao,</p>
<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1a1a1a;">${escapeEmailHtml(bodyLead)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;">${rowsHtml}</table>
${staffNoteHtml}`;

  const html = wrapSchoolEmail({
    appOrigin: SCHOOL_APP_URL,
    title: headline,
    htmlBody,
    showAppDownload,
    lockupLine: "SCHOOL",
  });

  return { subject, text, html };
}
