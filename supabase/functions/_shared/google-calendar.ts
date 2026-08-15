export type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type CalendarEventPayload = {
  summary: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso: string;
  calendarId: string;
  existingEventId?: string | null;
  colorId?: string | null;
  musicproBookingId?: string | null;
};

function base64UrlEncode(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const raw = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    raw,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export function parseServiceAccountJson(raw: string | undefined): GoogleServiceAccount | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as GoogleServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getGoogleAccessToken(
  sa: GoogleServiceAccount,
  subjectEmail?: string | null,
): Promise<string> {
  const scope = 'https://www.googleapis.com/auth/calendar';
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const subject = subjectEmail?.trim();
  const claimPayload: Record<string, string | number> = {
    iss: sa.client_email,
    scope,
    aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  if (subject) claimPayload.sub = subject;

  const claim = base64UrlEncode(JSON.stringify(claimPayload));
  const unsigned = `${header}.${claim}`;
  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  const sigBytes = new Uint8Array(signature);
  const sig = base64UrlEncode(String.fromCharCode(...sigBytes));
  const jwt = `${unsigned}.${sig}`;

  const res = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    const detail = [data.error, data.error_description].filter(Boolean).join(': ');
    throw new Error(detail || `Token Google fallito (${res.status})`);
  }
  return data.access_token;
}

export async function findCalendarEventByBookingId(
  token: string,
  calendarId: string,
  bookingId: string,
): Promise<{ id: string; htmlLink?: string } | null> {
  const calId = encodeURIComponent(calendarId);
  const prop = encodeURIComponent(`musicpro_booking_id=${bookingId}`);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?privateExtendedProperty=${prop}&maxResults=5`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = (await res.json()) as {
    items?: Array<{ id?: string; htmlLink?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Calendar LIST ${res.status}`);
  }
  const item = (data.items ?? []).find((i) => i.id);
  return item?.id ? { id: item.id, htmlLink: item.htmlLink } : null;
}

export async function upsertCalendarEvent(
  token: string,
  payload: CalendarEventPayload,
): Promise<{ id: string; htmlLink?: string }> {
  const extendedPrivate: Record<string, string> = {};
  if (payload.musicproBookingId?.trim()) {
    extendedPrivate.musicpro_booking_id = payload.musicproBookingId.trim();
  }

  const body: Record<string, unknown> = {
    summary: payload.summary,
    description: payload.description ?? '',
    location: payload.location ?? '',
    start: { dateTime: payload.startIso, timeZone: 'Europe/Rome' },
    end: { dateTime: payload.endIso, timeZone: 'Europe/Rome' },
  };
  if (payload.colorId?.trim()) {
    body.colorId = payload.colorId.trim();
  }
  if (Object.keys(extendedPrivate).length > 0) {
    body.extendedProperties = { private: extendedPrivate };
  }

  const calId = encodeURIComponent(payload.calendarId);
  let existingId = payload.existingEventId?.trim() || null;

  if (!existingId && payload.musicproBookingId?.trim()) {
    const found = await findCalendarEventByBookingId(
      token,
      payload.calendarId,
      payload.musicproBookingId.trim(),
    );
    existingId = found?.id ?? null;
  }

  if (existingId) {
    const eventId = encodeURIComponent(existingId);
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eventId}?sendUpdates=none`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    const data = (await res.json()) as {
      id?: string;
      htmlLink?: string;
      error?: { message?: string };
    };
    if (res.status === 404) {
      existingId = null;
    } else if (!res.ok || !data.id) {
      throw new Error(data.error?.message ?? `Calendar PATCH ${res.status}`);
    } else {
      return { id: data.id, htmlLink: data.htmlLink };
    }
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?sendUpdates=none`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  const data = (await res.json()) as {
    id?: string;
    htmlLink?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message ?? `Calendar POST ${res.status}`);
  }
  return { id: data.id, htmlLink: data.htmlLink };
}

export type CalendarListEvent = {
  id?: string;
  summary?: string;
  colorId?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

export async function listCalendarEventsInRange(
  token: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarListEvent[]> {
  const calId = encodeURIComponent(calendarId);
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  const items: CalendarListEvent[] = [];
  let pageToken: string | undefined;

  do {
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = (await res.json()) as {
      items?: CalendarListEvent[];
      nextPageToken?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(data.error?.message ?? `Calendar LIST ${res.status}`);
    }
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items.filter((event) => event.status !== 'cancelled' && event.id);
}

export async function deleteCalendarEvent(
  token: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (res.status !== 204 && res.status !== 410 && !res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message ?? `Calendar DELETE ${res.status}`);
  }
}
