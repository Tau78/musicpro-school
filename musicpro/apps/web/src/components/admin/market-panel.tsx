"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  formatEuro,
  marketListingStatusLabel,
  marketOrderStatusLabel,
  marketPayMethodLabel,
  marketPhotoPublicUrl,
  type MarketListing,
  type MarketOrder,
  type MarketPaymentSettings,
} from "@musicpro/database";

import {
  SettingsSectionTabs,
  settingsPrimaryButtonClass,
  settingsSecondaryButtonClass,
} from "@/components/admin/settings-page-chrome";

const fieldClass =
  "h-9 rounded-lg border border-neutral-300 px-2 text-sm text-neutral-900 focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

type Tab = "oggetti" | "richieste";

export function MarketPanel({
  listings,
  orders,
  settings,
  supabaseUrl,
}: {
  listings: MarketListing[];
  orders: MarketOrder[];
  settings: MarketPaymentSettings;
  supabaseUrl: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("oggetti");
  const [holder, setHolder] = useState(settings.holder);
  const [iban, setIban] = useState(settings.iban);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    price: "",
    status: "bozza" as "bozza" | "in_vendita",
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await task();
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Operazione non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  async function readJson(response: Response) {
    const data = (await response.json()) as { success?: boolean; message?: string };
    if (!response.ok || data.success === false) {
      throw new Error(data.message || "Operazione non riuscita.");
    }
  }

  return (
    <div>
      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const response = await fetch("/api/admin/market/settings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ holder, iban }),
            });
            await readJson(response);
            setNotice("Bonifico salvato.");
          });
        }}
      >
        <input
          className={`${fieldClass} min-w-[12rem] flex-1`}
          value={holder}
          onChange={(event) => setHolder(event.target.value)}
          placeholder="Intestatario bonifico"
          aria-label="Intestatario bonifico"
        />
        <input
          className={`${fieldClass} min-w-[14rem] flex-1 font-mono`}
          value={iban}
          onChange={(event) => setIban(event.target.value)}
          placeholder="IBAN"
          aria-label="IBAN"
          spellCheck={false}
        />
        <button type="submit" className={settingsPrimaryButtonClass} disabled={busy}>
          Salva
        </button>
      </form>

      <SettingsSectionTabs
        tabs={[
          { id: "oggetti", label: "Oggetti" },
          { id: "richieste", label: `Richieste${orders.length ? ` ${orders.length}` : ""}` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {notice ? <p className="mb-3 text-sm text-neutral-600">{notice}</p> : null}

      {tab === "oggetti" ? (
        <div>
          <form
            className="mb-3 flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const response = await fetch("/api/admin/market", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title, price }),
                });
                await readJson(response);
                setTitle("");
                setPrice("");
              });
            }}
          >
            <input
              className={`${fieldClass} min-w-[12rem] flex-1`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Oggetto, es. Chitarra acustica"
              aria-label="Titolo"
              required
            />
            <input
              className={`${fieldClass} w-28`}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="Prezzo €"
              aria-label="Prezzo in euro"
              inputMode="decimal"
              required
            />
            <button type="submit" className={settingsPrimaryButtonClass} disabled={busy}>
              Aggiungi
            </button>
          </form>

          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
            {listings.length === 0 ? (
              <li className="px-4 py-6 text-sm text-neutral-500">Nessun oggetto.</li>
            ) : (
              listings.map((listing) => {
                const open = openId === listing.id;
                const photo = marketPhotoPublicUrl(listing.photoPath, supabaseUrl);
                const locked = listing.status === "riservato" || listing.status === "venduto";
                return (
                  <li key={listing.id} className="px-3 py-2">
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 text-left"
                      onClick={() => {
                        if (open) {
                          setOpenId(null);
                          return;
                        }
                        setOpenId(listing.id);
                        setDraft({
                          title: listing.title,
                          description: listing.description,
                          price: (listing.priceCents / 100).toFixed(2).replace(".", ","),
                          status: listing.status === "in_vendita" ? "in_vendita" : "bozza",
                        });
                      }}
                    >
                      {photo ? (
                        <img
                          src={photo}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span className="h-10 w-10 shrink-0 rounded-md bg-neutral-100" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">
                        {listing.title}
                      </span>
                      <span className="shrink-0 text-sm text-neutral-700">
                        {formatEuro(listing.priceCents / 100)}
                      </span>
                      <span className="shrink-0 text-xs text-neutral-500">
                        {marketListingStatusLabel(listing.status)}
                      </span>
                    </button>
                    {open ? (
                      <form
                        className="mt-2 flex flex-wrap items-center gap-2 pl-[3.25rem]"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void run(async () => {
                            const response = await fetch(`/api/admin/market/${listing.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                title: draft.title,
                                description: draft.description,
                                price: draft.price,
                                status: locked ? undefined : draft.status,
                              }),
                            });
                            await readJson(response);
                          });
                        }}
                      >
                        <input
                          className={`${fieldClass} min-w-[10rem] flex-1`}
                          value={draft.title}
                          disabled={locked}
                          aria-label="Titolo"
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, title: event.target.value }))
                          }
                        />
                        <input
                          className={`${fieldClass} w-24`}
                          value={draft.price}
                          disabled={locked}
                          aria-label="Prezzo"
                          inputMode="decimal"
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, price: event.target.value }))
                          }
                        />
                        <select
                          className={`${fieldClass} w-32`}
                          value={locked ? listing.status : draft.status}
                          disabled={locked}
                          aria-label="Stato"
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              status: event.target.value === "in_vendita" ? "in_vendita" : "bozza",
                            }))
                          }
                        >
                          {locked ? (
                            <option value={listing.status}>
                              {marketListingStatusLabel(listing.status)}
                            </option>
                          ) : (
                            <>
                              <option value="bozza">Bozza</option>
                              <option value="in_vendita">In vendita</option>
                            </>
                          )}
                        </select>
                        <input
                          className={`${fieldClass} min-w-[12rem] flex-[2]`}
                          value={draft.description}
                          disabled={locked}
                          placeholder="Descrizione"
                          aria-label="Descrizione"
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                        <label className="text-xs text-neutral-500">
                          Foto
                          <input
                            className="ml-1 max-w-[9rem] text-xs"
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            aria-label="Foto"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = "";
                              if (!file) return;
                              void run(async () => {
                                const body = new FormData();
                                body.set("file", file);
                                const response = await fetch(
                                  `/api/admin/market/${listing.id}/photo`,
                                  { method: "POST", body },
                                );
                                await readJson(response);
                              });
                            }}
                          />
                        </label>
                        <button
                          type="submit"
                          className={settingsPrimaryButtonClass}
                          disabled={busy || locked}
                        >
                          Salva
                        </button>
                        {listing.status === "bozza" ? (
                          <button
                            type="button"
                            className={settingsSecondaryButtonClass}
                            disabled={busy}
                            onClick={() => {
                              void run(async () => {
                                const response = await fetch(`/api/admin/market/${listing.id}`, {
                                  method: "DELETE",
                                });
                                await readJson(response);
                                setOpenId(null);
                              });
                            }}
                          >
                            Elimina
                          </button>
                        ) : null}
                      </form>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
          {orders.length === 0 ? (
            <li className="px-4 py-6 text-sm text-neutral-500">Nessuna richiesta.</li>
          ) : (
            orders.map((order) => {
              const open = order.status === "richiesto" || order.status === "in_attesa";
              return (
                <li key={order.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 text-sm text-neutral-900">
                    <span className="font-medium">{order.buyerName}</span>
                    <span className="text-neutral-500">
                      {" "}
                      · {order.listingTitle} · {marketPayMethodLabel(order.method)} ·{" "}
                      {formatEuro(order.amountCents / 100)} · {marketOrderStatusLabel(order.status)}
                    </span>
                    {order.buyerPhone || order.buyerEmail ? (
                      <span className="block truncate text-xs text-neutral-500">
                        {[order.buyerPhone, order.buyerEmail].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  {open && order.method !== "nexi" ? (
                    <button
                      type="button"
                      className={settingsSecondaryButtonClass}
                      disabled={busy}
                      onClick={() => {
                        void run(() => patchOrder(order.id, "pagato"));
                      }}
                    >
                      Pagato
                    </button>
                  ) : null}
                  {order.status === "pagato" ||
                  (order.method === "contanti" && order.status === "richiesto") ? (
                    <button
                      type="button"
                      className={settingsPrimaryButtonClass}
                      disabled={busy}
                      onClick={() => {
                        void run(() => patchOrder(order.id, "ritirato"));
                      }}
                    >
                      Ritirato
                    </button>
                  ) : null}
                  {open ? (
                    <button
                      type="button"
                      className={settingsSecondaryButtonClass}
                      disabled={busy}
                      onClick={() => {
                        void run(() => patchOrder(order.id, "annullato"));
                      }}
                    >
                      Annulla
                    </button>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

async function patchOrder(id: string, status: "pagato" | "ritirato" | "annullato") {
  const response = await fetch(`/api/admin/market/orders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = (await response.json()) as { success?: boolean; message?: string };
  if (!response.ok || data.success === false) {
    throw new Error(data.message || "Operazione non riuscita.");
  }
}
