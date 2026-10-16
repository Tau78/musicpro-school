/** Email di avvio corso: tabelle e stili inline, colori scuola. */

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

function bulletproofButton(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="14%" strokecolor="${NAVY}" fillcolor="${NAVY}">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${safeLabel}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${safeHref}" style="background-color:${NAVY};border-radius:8px;color:#ffffff;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:48px;text-align:center;text-decoration:none;width:260px;-webkit-text-size-adjust:none;mso-hide:all;"><span style="color:#ffffff;">${safeLabel}</span></a>
<!--<![endif]-->`;
}

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

  const textLines = [
    "Ciao,",
    "",
    `il corso ${courseName} ${input.statusLine}`,
    "",
    ...facts,
  ];
  if (input.signInUrl) {
    textLines.push(
      "",
      "Entra nella tua area (il link vale una sola volta):",
      input.signInUrl,
    );
  }
  textLines.push("", "MusicPro School");

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
        `<p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${INK};">${escapeHtml(note)}</p>`,
    )
    .join("");

  const button = input.signInUrl
    ? `<tr>
        <td align="center" style="padding:8px 28px 4px;">
          ${bulletproofButton(input.signInUrl, "Entra nella tua area")}
        </td>
      </tr>
      <tr>
        <td style="padding:12px 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${MUTED};">
          Il link vale una sola volta, per circa un'ora.
          Se il pulsante non si apre, copia questo indirizzo:<br />
          <a href="${escapeHtml(input.signInUrl)}" style="color:${NAVY};word-break:break-all;">${escapeHtml(input.signInUrl)}</a>
        </td>
      </tr>`
    : "";

  const preheader = when
    ? `Prima lezione ${when}${room ? ` · ${room}` : ""}`
    : `Corso ${courseName}`;

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(courseName)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAPER};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${PAPER}" style="background-color:${PAPER};margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <!--[if mso]><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background-color:${CARD};border-collapse:separate;">
          <tr>
            <td bgcolor="${GOLD}" style="background-color:${GOLD};height:6px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td bgcolor="${NAVY}" style="background-color:${NAVY};padding:22px 28px 18px;">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD};">MusicPro School</p>
              <p style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;color:#ffffff;">Nuovo corso</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:${INK};">
              Ciao,<br /><br />
              il corso <strong style="color:${NAVY};">${escapeHtml(courseName)}</strong> ${escapeHtml(input.statusLine)}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                ${detailRows || row("Lezione", "Data e ora in arrivo")}
              </table>
              ${notesHtml}
            </td>
          </tr>
          ${button}
          <tr>
            <td style="padding:22px 28px 26px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${MUTED};">
              A presto,<br />MusicPro School
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { text: textLines.join("\n"), html };
}

function row(label: string, value: string): string {
  return `<tr>
    <td width="108" valign="top" style="padding:10px 12px 10px 0;border-top:1px solid #e6dcc4;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${NAVY};">${escapeHtml(label)}</td>
    <td valign="top" style="padding:10px 0;border-top:1px solid #e6dcc4;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;color:${NAVY};font-weight:bold;">${escapeHtml(value)}</td>
  </tr>`;
}
