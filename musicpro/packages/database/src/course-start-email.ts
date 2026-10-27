/** Email di avvio corso — guscio MusicPro School (wrapSchoolEmail). */

import {
  escapeEmailHtml,
  schoolEmailTextFooter,
  SCHOOL_APP_URL,
  SCHOOL_BRAND_NAVY,
  wrapSchoolEmail,
} from "@musicpro/shared";

export type CourseStartEmailInput = {
  courseName: string;
  statusLine: string;
  whenDate: string | null;
  whenTime: string | null;
  room: string | null;
  notes: string[];
  /** Solo famiglia. Il docente non riceve il link. */
  signInUrl?: string | null;
};

export function renderCourseStartEmail(input: CourseStartEmailInput): {
  text: string;
  html: string;
} {
  const courseName = input.courseName.trim() || "il corso";
  const when =
    input.whenDate && input.whenTime
      ? `${input.whenDate} alle ${input.whenTime}`
      : null;
  const room = input.room?.trim() || null;
  const facts: string[] = [];
  if (when) facts.push(`Prima lezione: ${when}`);
  if (room) facts.push(`Sala: ${room}`);
  facts.push(...input.notes);

  const signInUrl = input.signInUrl?.trim() || null;
  const showAppDownload = Boolean(signInUrl);

  const textLines = [
    "Ciao,",
    "",
    `il corso ${courseName} ${input.statusLine}`,
    "",
    ...facts,
  ];
  if (signInUrl) {
    textLines.push(
      "",
      "Entra nella tua area (il link vale una sola volta):",
      signInUrl,
    );
  }
  const text = textLines.join("\n") + schoolEmailTextFooter({ showAppDownload });

  const detailRows = [
    input.whenDate ? row("Data", input.whenDate) : "",
    input.whenTime ? row("Orario", input.whenTime) : "",
    room ? row("Sala", room) : "",
  ]
    .filter(Boolean)
    .join("");
  const notesHtml = input.notes
    .map(
      (note) =>
        `<p style="margin:12px 0 0;font-size:14px;line-height:1.5;color:#1a1a1a;">${escapeEmailHtml(note)}</p>`,
    )
    .join("");

  const signInHint = signInUrl
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">Il link vale una sola volta, per circa un'ora. Se il pulsante non si apre, copia questo indirizzo:<br /><a href="${escapeEmailHtml(signInUrl)}" style="color:${SCHOOL_BRAND_NAVY};word-break:break-all;">${escapeEmailHtml(signInUrl)}</a></p>`
    : "";

  const htmlBody = `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1a1a1a;">Ciao,</p>
<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1a1a1a;">il corso <strong style="color:${SCHOOL_BRAND_NAVY};">${escapeEmailHtml(courseName)}</strong> ${escapeEmailHtml(input.statusLine)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin:0 0 8px;">
${detailRows || row("Lezione", "Data e ora in arrivo")}
</table>
${notesHtml}
${signInHint}`;

  const preheader = when
    ? `Prima lezione ${when}${room ? ` · ${room}` : ""}`
    : `Corso ${courseName}`;

  const ctas = signInUrl
    ? [{ href: signInUrl, label: "Entra nella tua area" }]
    : undefined;

  const html = wrapSchoolEmail({
    appOrigin: SCHOOL_APP_URL,
    preheader,
    title: "Nuovo corso",
    htmlBody,
    ctas,
    showAppDownload,
    lockupLine: "SCHOOL",
  });

  return { text, html };
}

function row(label: string, value: string): string {
  return `<tr>
    <td width="108" valign="top" style="padding:10px 12px 10px 0;border-top:1px solid #e6dcc4;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${SCHOOL_BRAND_NAVY};">${escapeEmailHtml(label)}</td>
    <td valign="top" style="padding:10px 0;border-top:1px solid #e6dcc4;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;color:${SCHOOL_BRAND_NAVY};font-weight:bold;">${escapeEmailHtml(value)}</td>
  </tr>`;
}
