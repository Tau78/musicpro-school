import { htmlPaymentResult } from '../_shared/nexi-xpay.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  let esito = (url.searchParams.get('esito') ?? '').trim().toUpperCase();

  if (req.method === 'POST') {
    const body = await req.text();
    const params = new URLSearchParams(body);
    esito = (params.get('esito') ?? esito).trim().toUpperCase();
  }

  const ok = esito === 'OK';
  const webBase = (
    Deno.env.get('PUBLIC_WEB_URL') ??
    Deno.env.get('NEXT_PUBLIC_APP_URL') ??
    'https://school.musicproeventi.it'
  ).replace(/\/$/, '');

  const message = ok
    ? 'Se il pagamento è andato a buon fine, la prenotazione risulta confermata entro pochi secondi. Apri le tue prenotazioni per lo stato aggiornato e controlla l’email di riepilogo.'
    : esito === 'ANNULLO'
    ? 'Hai annullato il pagamento. La prenotazione resta in attesa: puoi pagare di nuovo da «Le mie prenotazioni» o chiedere un nuovo link alla segreteria.'
    : 'Il pagamento non è stato completato. La prenotazione non risulta pagata: riprova da «Le mie prenotazioni» o contatta la segreteria.';

  const continueHref = ok
    ? `${webBase}/prenotazioni/mie?dopoPagamento=1`
    : `${webBase}/prenotazioni/mie`;
  const continueLabel = ok ? 'Le mie prenotazioni' : 'Torna alle prenotazioni';

  return new Response(htmlPaymentResult(ok, message, { continueHref, continueLabel }), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
});
