import {
  getMarketPaymentSettings,
  normalizeMarketTitle,
} from "@musicpro/database";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { mintNexiPayment } from "@/lib/nexi/mint-payment";

const METHODS = new Set(["bonifico", "contanti", "nexi"]);

export type ReserveMarketInput = {
  listingId?: string;
  name?: string;
  email?: string;
  phone?: string;
  method?: string;
  website?: string;
};

export async function reserveMarketListing(input: ReserveMarketInput) {
  if (String(input.website ?? "").trim()) {
    return { success: true, message: "Richiesta registrata." };
  }

  const listingId = String(input.listingId ?? "").trim();
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  const email = String(input.email ?? "").trim().toLowerCase();
  const phone = String(input.phone ?? "").trim();
  const method = String(input.method ?? "").trim();

  if (!listingId) return { success: false, message: "Oggetto mancante." };
  if (name.length < 2 || name.length > 120) {
    return { success: false, message: "Scrivi nome e cognome." };
  }
  if (!email && !phone) {
    return { success: false, message: "Serve email o telefono." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, message: "Email non valida." };
  }
  if (phone && phone.replace(/\D/g, "").length < 6) {
    return { success: false, message: "Telefono non valido." };
  }
  if (!METHODS.has(method)) {
    return { success: false, message: "Scegli come pagare." };
  }

  const service = createServiceRoleClient();
  const claimed = await service
    .from("market_listings")
    .update({ status: "riservato" })
    .eq("id", listingId)
    .eq("status", "in_vendita")
    .select("*")
    .maybeSingle();

  if (claimed.error) {
    return { success: false, message: "Impossibile riservare l'oggetto." };
  }
  if (!claimed.data) {
    return { success: false, message: "Questo oggetto non è più in vendita." };
  }
  if (claimed.data.price_cents < 100) {
    await service
      .from("market_listings")
      .update({ status: "in_vendita" })
      .eq("id", listingId)
      .eq("status", "riservato");
    return { success: false, message: "Prezzo non valido." };
  }

  const orderStatus = method === "contanti" ? "richiesto" : "in_attesa";
  const inserted = await service
    .from("market_orders")
    .insert({
      listing_id: listingId,
      buyer_name: name,
      buyer_email: email || null,
      buyer_phone: phone || null,
      method: method as "bonifico" | "contanti" | "nexi",
      status: orderStatus,
      amount_cents: claimed.data.price_cents,
    })
    .select("id")
    .single();

  if (inserted.error || !inserted.data) {
    await service
      .from("market_listings")
      .update({ status: "in_vendita" })
      .eq("id", listingId)
      .eq("status", "riservato");
    return { success: false, message: "Impossibile registrare la richiesta." };
  }

  const orderId = inserted.data.id;
  const title = normalizeMarketTitle(claimed.data.title) ?? claimed.data.title;

  if (method === "nexi") {
    const parts = name.split(" ");
    const minted = await mintNexiPayment({
      flow: "market",
      amountCents: claimed.data.price_cents,
      returnUrl: `https://www.musicproeventi.it/market.html?ordine=${orderId}`,
      description: `Market ${title}`.slice(0, 180),
      email: email || null,
      firstName: parts[0] || name,
      lastName: parts.slice(1).join(" ") || name,
      metadata: { market_order_id: orderId, mp_flow: "market" },
    });
    if (!minted.success || !minted.url) {
      await service.from("market_orders").update({ status: "annullato" }).eq("id", orderId);
      await service
        .from("market_listings")
        .update({ status: "in_vendita" })
        .eq("id", listingId)
        .eq("status", "riservato");
      return {
        success: false,
        message: minted.message || "Pagamento con carta non disponibile.",
      };
    }
    await service
      .from("market_orders")
      .update({ nexi_cod_trans: minted.paymentId ?? null })
      .eq("id", orderId);
    return {
      success: true,
      method,
      payUrl: minted.url,
      message: "Apri il pagamento. Dopo l'accredito ritiri in sede: niente spedizione.",
    };
  }

  if (method === "bonifico") {
    const settings = await getMarketPaymentSettings(service);
    return {
      success: true,
      method,
      iban: settings.iban,
      holder: settings.holder,
      message: settings.iban
        ? "Riservato. Bonifico anticipato, poi ritiro in sede. Niente spedizione."
        : "Riservato. Ti scriviamo con le coordinate del bonifico. Ritiro in sede.",
    };
  }

  return {
    success: true,
    method,
    message: "Riservato. Paghi in contanti al ritiro in sede. Niente spedizione.",
  };
}
