import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno';

export const PAID_STRIPE_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'payment_intent.succeeded',
]);

export const ROOM_BOOKING_FLOW = 'room_booking';

export function stripeClient(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  if (!key) throw new Error('STRIPE_SECRET_KEY non configurata su Edge');
  return new Stripe(key, { apiVersion: '2024-11-20.acacia' });
}

export function verifyStripeEvent(req: Request, rawBody: string): Stripe.Event {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET non configurata su Edge');
  const sig = req.headers.get('stripe-signature');
  if (!sig) throw new Error('Header Stripe-Signature mancante');
  const stripe = stripeClient();
  return stripe.webhooks.constructEvent(rawBody, sig, secret);
}

export function metadataBookingRef(metadata: Stripe.Metadata | null | undefined): string {
  if (!metadata) return '';
  return String(
    metadata.mp_id_prenotazione ?? metadata.idPrenotazione ?? metadata.id_prenotazione ?? '',
  ).trim();
}

export function metadataFlow(metadata: Stripe.Metadata | null | undefined): string {
  if (!metadata) return '';
  return String(metadata.mp_flow ?? '').trim();
}

export function paymentIntentIdFromObject(obj: Stripe.Checkout.Session | Stripe.PaymentIntent): string {
  const pi = (obj as Stripe.Checkout.Session).payment_intent ?? (obj as Stripe.PaymentIntent).id;
  if (typeof pi === 'string') return pi;
  if (pi && typeof pi === 'object' && 'id' in pi) return String(pi.id);
  return '';
}

export function paymentLinkIdFromSession(session: Stripe.Checkout.Session): string {
  const pl = session.payment_link;
  if (typeof pl === 'string') return pl;
  if (pl && typeof pl === 'object' && 'id' in pl) return String(pl.id);
  return '';
}

export async function resolveRoomBookingFromEvent(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<{
  bookingRef: string;
  paymentIntentId: string;
  paymentLinkId: string;
  amountCents: number;
  flow: string;
}> {
  const obj = event.data.object;

  if (event.type.startsWith('checkout.session')) {
    const session = obj as Stripe.Checkout.Session;
    let bookingRef = metadataBookingRef(session.metadata ?? undefined);
    let flow = metadataFlow(session.metadata ?? undefined);
    const paymentIntentId = paymentIntentIdFromObject(session);
    const paymentLinkId = paymentLinkIdFromSession(session);
    let amountCents = Number(session.amount_total ?? 0);

    if ((!bookingRef || !flow) && paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (!bookingRef) bookingRef = metadataBookingRef(pi.metadata);
      if (!flow) flow = metadataFlow(pi.metadata);
      if (!amountCents) amountCents = Number(pi.amount_received ?? pi.amount ?? 0);
    }
    if (!bookingRef && session.client_reference_id) {
      bookingRef = String(session.client_reference_id).trim();
    }

    return { bookingRef, paymentIntentId, paymentLinkId, amountCents, flow };
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = obj as Stripe.PaymentIntent;
    const bookingRef = metadataBookingRef(pi.metadata);
    const flow = metadataFlow(pi.metadata);
    let paymentLinkId = '';

    if (pi.id) {
      const sessions = await stripe.checkout.sessions.list({
        payment_intent: pi.id,
        limit: 1,
      });
      if (sessions.data[0]) {
        paymentLinkId = paymentLinkIdFromSession(sessions.data[0]);
      }
    }

    return {
      bookingRef,
      paymentIntentId: pi.id ?? '',
      paymentLinkId,
      amountCents: Number(pi.amount_received ?? pi.amount ?? 0),
      flow,
    };
  }

  return { bookingRef: '', paymentIntentId: '', paymentLinkId: '', amountCents: 0, flow: '' };
}

export async function deactivatePaymentLink(stripe: Stripe, paymentLinkId: string): Promise<void> {
  const plId = paymentLinkId.trim();
  if (!plId.startsWith('pl_')) return;
  try {
    await stripe.paymentLinks.update(plId, { active: false });
  } catch (e) {
    console.error('[stripe] deactivate payment link', plId, e);
  }
}

export const CREDIT_SHOP_FLOW = 'shop_credit_package';

export function metadataMemberId(metadata: Stripe.Metadata | null | undefined): string {
  if (!metadata) return '';
  return String(metadata.mp_member_id ?? metadata.mp_id_membro ?? '').trim();
}

export function metadataPackageId(metadata: Stripe.Metadata | null | undefined): string {
  if (!metadata) return '';
  return String(metadata.mp_package_id ?? '').trim();
}

export function verifyStripeEventWithSecret(
  req: Request,
  rawBody: string,
  webhookSecret: string,
): Stripe.Event {
  const secret = webhookSecret.trim();
  if (!secret) throw new Error('Webhook secret Stripe non configurato su Edge');
  const sig = req.headers.get('stripe-signature');
  if (!sig) throw new Error('Header Stripe-Signature mancante');
  const stripe = stripeClient();
  return stripe.webhooks.constructEvent(rawBody, sig, secret);
}

export async function resolveCreditShopFromEvent(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<{
  memberId: string;
  packageId: string;
  paymentIntentId: string;
  paymentLinkId: string;
  amountCents: number;
  flow: string;
}> {
  const obj = event.data.object;

  if (event.type.startsWith('checkout.session')) {
    const session = obj as Stripe.Checkout.Session;
    let memberId = metadataMemberId(session.metadata ?? undefined);
    let packageId = metadataPackageId(session.metadata ?? undefined);
    let flow = metadataFlow(session.metadata ?? undefined);
    const paymentIntentId = paymentIntentIdFromObject(session);
    const paymentLinkId = paymentLinkIdFromSession(session);
    let amountCents = Number(session.amount_total ?? 0);

    if ((!memberId || !packageId || !flow) && paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (!memberId) memberId = metadataMemberId(pi.metadata);
      if (!packageId) packageId = metadataPackageId(pi.metadata);
      if (!flow) flow = metadataFlow(pi.metadata);
      if (!amountCents) amountCents = Number(pi.amount_received ?? pi.amount ?? 0);
    }

    if (!memberId && session.client_reference_id) {
      const ref = String(session.client_reference_id).trim();
      const colonIdx = ref.indexOf(':');
      if (colonIdx > 0) {
        memberId = ref.slice(0, colonIdx).trim();
        if (!packageId) packageId = ref.slice(colonIdx + 1).trim();
      }
    }

    return { memberId, packageId, paymentIntentId, paymentLinkId, amountCents, flow };
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = obj as Stripe.PaymentIntent;
    const memberId = metadataMemberId(pi.metadata);
    const packageId = metadataPackageId(pi.metadata);
    const flow = metadataFlow(pi.metadata);
    let paymentLinkId = '';

    if (pi.id) {
      const sessions = await stripe.checkout.sessions.list({
        payment_intent: pi.id,
        limit: 1,
      });
      if (sessions.data[0]) {
        paymentLinkId = paymentLinkIdFromSession(sessions.data[0]);
      }
    }

    return {
      memberId,
      packageId,
      paymentIntentId: pi.id ?? '',
      paymentLinkId,
      amountCents: Number(pi.amount_received ?? pi.amount ?? 0),
      flow,
    };
  }

  return {
    memberId: '',
    packageId: '',
    paymentIntentId: '',
    paymentLinkId: '',
    amountCents: 0,
    flow: '',
  };
}
