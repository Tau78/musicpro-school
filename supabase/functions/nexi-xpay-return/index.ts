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
  const message = ok
    ? 'Se il pagamento è andato a buon fine, lo stato si aggiorna in pochi secondi. Puoi chiudere questa pagina e tornare al sito.'
    : esito === 'ANNULLO'
    ? 'Hai annullato il pagamento. Se serve, chiedi un nuovo link alla segreteria.'
    : 'Il pagamento non è stato completato. Se il problema continua, contatta la segreteria.';

  return new Response(htmlPaymentResult(ok, message), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
});
