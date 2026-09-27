import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import {
  buildSimplePayFields,
  edgeFunctionsBaseUrl,
  htmlPaymentResult,
  loadNexiXpayConfig,
  nexiPublicPayPageUrl,
} from '../_shared/nexi-xpay.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type OrderRow = {
  id: string;
  flow: string;
  status: string | null;
  provider_payment_id: string | null;
  payment_link_url: string | null;
  amount_cents: number | null;
  return_url: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  description: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown> | null;
};

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return createClient(url, key);
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function historyList(meta: Record<string, unknown> | null | undefined): string[] {
  const raw = meta?.cod_trans_history;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x ?? '').trim()).filter(Boolean);
}

async function findOrderByCodTrans(
  service: ReturnType<typeof serviceClient>,
  codTrans: string,
): Promise<{ order: OrderRow; via: 'current' | 'history' } | null> {
  const { data: current } = await service
    .from('nexi_payment_orders')
    .select(
      'id, flow, status, provider_payment_id, payment_link_url, amount_cents, return_url, email, first_name, last_name, description, expires_at, metadata',
    )
    .eq('provider_payment_id', codTrans)
    .maybeSingle();
  if (current?.id) {
    return { order: current as OrderRow, via: 'current' };
  }

  const { data: rows } = await service
    .from('nexi_payment_orders')
    .select(
      'id, flow, status, provider_payment_id, payment_link_url, amount_cents, return_url, email, first_name, last_name, description, expires_at, metadata',
    )
    .contains('metadata', { cod_trans_history: [codTrans] })
    .limit(5);

  const match = (rows ?? []).find((row) =>
    historyList(row.metadata as Record<string, unknown>).includes(codTrans),
  );
  if (match?.id) {
    return { order: match as OrderRow, via: 'history' };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return new Response('Metodo non consentito', { status: 405, headers: corsHeaders });
  }

  const config = loadNexiXpayConfig();
  if (!config) {
    return html(
      htmlPaymentResult(false, 'Pagamento online temporaneamente non disponibile. Contatta la segreteria.'),
      503,
    );
  }

  const url = new URL(req.url);
  const codTrans = (url.searchParams.get('t') ?? url.searchParams.get('codTrans') ?? '').trim();
  if (!codTrans || codTrans.length < 2 || codTrans.length > 30) {
    return html(htmlPaymentResult(false, 'Link di pagamento non valido.'), 400);
  }

  const service = serviceClient();
  const found = await findOrderByCodTrans(service, codTrans);
  if (!found) {
    return html(
      htmlPaymentResult(
        false,
        'Questo link non è più associato a un pagamento. Chiedi un nuovo link alla segreteria.',
      ),
      404,
    );
  }

  const { order, via } = found;
  const currentCod = String(order.provider_payment_id ?? '').trim();
  const currentUrl = String(order.payment_link_url ?? '').trim();

  if (via === 'history' && currentCod && currentCod !== codTrans && currentUrl) {
    return html(
      htmlPaymentResult(
        false,
        'Questo link è stato aggiornato. Tocca il pulsante per continuare con il pagamento.',
        { continueHref: currentUrl, continueLabel: 'Continua al pagamento' },
      ),
      200,
    );
  }

  if (order.status === 'paid') {
    const continueHref = String(order.return_url ?? '').trim();
    return html(
      htmlPaymentResult(true, 'Questo pagamento risulta già registrato. Grazie!', {
        continueHref: continueHref || undefined,
        continueLabel: 'Torna al sito',
      }),
      200,
    );
  }

  if (order.status === 'cancelled' || order.status === 'expired') {
    return html(
      htmlPaymentResult(false, 'Questo pagamento non è più valido. Chiedi un nuovo link.'),
      410,
    );
  }

  if (order.expires_at && new Date(String(order.expires_at)).getTime() < Date.now()) {
    return html(
      htmlPaymentResult(false, 'Il link di pagamento è scaduto. Chiedi un nuovo link alla segreteria.'),
      410,
    );
  }

  const amountCents = Number(order.amount_cents ?? 0);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return html(
      htmlPaymentResult(false, 'Importo non configurato. Contatta la segreteria.'),
      422,
    );
  }

  const payCod = currentCod || codTrans;
  const base = edgeFunctionsBaseUrl();
  const storedReturn = String(order.return_url ?? '').trim();
  const returnUrl = storedReturn || `${base}/nexi-xpay-return?esito=OK`;
  const cancelUrl = `${base}/nexi-xpay-return?esito=ANNULLO`;
  const notifyUrl = `${base}/nexi-xpay-notify`;

  const fields = await buildSimplePayFields({
    config,
    codTrans: payCod,
    amountCents,
    returnUrl,
    cancelUrl,
    notifyUrl,
    email: order.email,
    description: order.description,
    firstName: order.first_name,
    lastName: order.last_name,
  });

  const formFields: Record<string, string> = {
    alias: fields.alias,
    importo: fields.importo,
    divisa: fields.divisa,
    codTrans: fields.codTrans,
    url: fields.url,
    url_back: fields.url_back,
    urlpost: fields.urlpost,
    mac: fields.mac,
  };
  if (fields.mail) formFields.mail = fields.mail;
  if (fields.descrizione) formFields.descrizione = fields.descrizione;
  if (fields.nome) formFields.nome = fields.nome;
  if (fields.cognome) formFields.cognome = fields.cognome;
  if (fields.languageId) formFields.languageId = fields.languageId;

  const customerName = [order.first_name, order.last_name].filter(Boolean).join(' ').trim();
  const wantJson = (url.searchParams.get('format') ?? '').toLowerCase() === 'json' ||
    (req.headers.get('accept') ?? '').includes('application/json');

  if (!wantJson) {
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: nexiPublicPayPageUrl(payCod),
        'Cache-Control': 'no-store',
      },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      dispatcher_url: config.dispatcherUrl,
      fields: formFields,
      display: {
        amount_cents: amountCents,
        customer_name: customerName,
        event_label: order.description ?? 'Pagamento MusicPro School',
        nexi_env: config.env,
        flow: order.flow,
      },
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
});
