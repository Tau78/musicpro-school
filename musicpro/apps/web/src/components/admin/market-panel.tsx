"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  formatEuro,
  marketHandoverLabel,
  marketListingStatusLabel,
  marketOrderStatusLabel,
  marketPayMethodLabel,
  marketPhotoPublicUrl,
  type MarketListing,
  type MarketListingStatus,
  type MarketOrder,
  type MarketPaymentSettings,
  type SaleLedgerEntry,
} from "@musicpro/database";

import {
  SettingsSectionTabs,
  settingsPrimaryButtonClass,
  settingsSecondaryButtonClass,
} from "@/components/admin/settings-page-chrome";

const fieldClass =
  "h-9 rounded-lg border border-neutral-300 px-2 text-sm text-neutral-900 focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

type Tab = "catalogo" | "richieste" | "bilancio";
type CatalogFilter = "tutti" | "revisione" | "vendita" | "bozze" | "venduti";

const emptyDraft = {
  title: "",
  price: "",
  description: "",
  status: "in_vendita" as MarketListingStatus,
};

export function MarketPanel({
  listings,
  orders,
  settings,
  ledger,
  ledgerYear,
  supabaseUrl,
  schoolOnly = false,
}: {
  listings: MarketListing[];
  orders: MarketOrder[];
  settings: MarketPaymentSettings;
  ledger: SaleLedgerEntry[];
  ledgerYear: number;
  supabaseUrl: string;
  schoolOnly?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("catalogo");
  const [filter, setFilter] = useState<CatalogFilter>("tutti");
  const [query, setQuery] = useState("");
  const [holder, setHolder] = useState(settings.holder);
  const [iban, setIban] = useState(settings.iban);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const pending = schoolOnly
    ? 0
    : listings.filter((item) => item.status === "in_revisione").length;
  const selected = listings.find((item) => item.id === selectedId) ?? null;

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return listings.filter((item) => {
      if (filter === "revisione" && item.status !== "in_revisione") return false;
      if (filter === "vendita" && item.status !== "in_vendita" && item.status !== "riservato") {
        return false;
      }
      if (filter === "bozze" && item.status !== "bozza" && item.status !== "rifiutato") return false;
      if (filter === "venduti" && item.status !== "venduto") return false;
      if (!term) return true;
      return (
        item.title.toLowerCase().includes(term) ||
        (item.sellerName ?? "").toLowerCase().includes(term)
      );
    });
  }, [filter, listings, query]);

  async function readJson(response: Response) {
    const data = (await response.json()) as { success?: boolean; message?: string };
    if (!response.ok || data.success === false) {
      throw new Error(data.message || "Operazione non riuscita.");
    }
  }

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

  function openListing(item: MarketListing) {
    setCreating(false);
    setPhotoFile(null);
    setSelectedId(item.id);
    setDraft({
      title: item.title,
      price: (item.priceCents / 100).toFixed(2).replace(".", ","),
      description: item.description,
      status:
        item.sellerKind === "associato"
          ? item.status
          : item.status === "in_vendita"
            ? "in_vendita"
            : "bozza",
    });
  }

  const editor = creating || selected;
  const locked = selected?.status === "riservato" || selected?.status === "venduto";
  const associate = selected?.sellerKind === "associato";

  return (
    <div>
      {schoolOnly ? null : (
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
          placeholder="IBAN associazione"
          aria-label="IBAN"
          spellCheck={false}
        />
        <button type="submit" className={settingsPrimaryButtonClass} disabled={busy}>
          Salva
        </button>
      </form>
      )}

      <SettingsSectionTabs
        tabs={[
          { id: "catalogo", label: pending ? `Catalogo · ${pending} da approvare` : "Catalogo" },
          { id: "richieste", label: "Richieste" },
          ...(schoolOnly ? [] : [{ id: "bilancio" as const, label: "Bilancio" }]),
        ]}
        value={tab}
        onChange={setTab}
      />
      {notice ? <p className="mb-3 text-sm text-neutral-600">{notice}</p> : null}

      {tab === "catalogo" ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                className={`${fieldClass} min-w-[10rem] flex-1`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cerca titolo o venditore"
                aria-label="Cerca annunci"
              />
              <button
                type="button"
                className={settingsPrimaryButtonClass}
                onClick={() => {
                  setCreating(true);
                  setSelectedId(null);
                  setPhotoFile(null);
                  setDraft(emptyDraft);
                }}
              >
                Nuovo annuncio
              </button>
            </div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {(
                [
                  { id: "tutti" as const, label: "Tutti" },
                  ...(schoolOnly
                    ? []
                    : [{ id: "revisione" as const, label: "Da approvare" }]),
                  { id: "vendita" as const, label: "In vendita" },
                  { id: "bozze" as const, label: "Bozze" },
                  { id: "venduti" as const, label: "Venduti" },
                ] satisfies { id: CatalogFilter; label: string }[]
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    filter === id
                      ? "bg-[var(--brand)] text-white"
                      : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
              {visible.length === 0 ? (
                <li className="px-4 py-6 text-sm text-neutral-500">Nessun annuncio.</li>
              ) : (
                visible.map((item) => {
                  const photo = marketPhotoPublicUrl(item.photoPath, supabaseUrl);
                  const active = !creating && item.id === selectedId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openListing(item)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                          active ? "bg-neutral-50" : ""
                        }`}
                      >
                        {photo ? (
                          <img src={photo} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                        ) : (
                          <span className="h-12 w-12 shrink-0 rounded-md bg-neutral-100" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-neutral-900">
                            {item.title}
                          </span>
                          <span className="block truncate text-xs text-neutral-500">
                            {item.sellerKind === "associato"
                              ? item.sellerName || "Associato"
                              : "Associazione"}
                            {item.fixedAssetId ? " · cespite" : ""}
                            {" · "}
                            {marketListingStatusLabel(item.status)}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-medium text-neutral-900">
                          {formatEuro(item.priceCents / 100)}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          {editor ? (
            <form
              className="rounded-xl border border-neutral-200 bg-white p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  if (creating) {
                    const response = await fetch("/api/admin/market", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        title: draft.title,
                        price: draft.price,
                        description: draft.description,
                        status: draft.status === "in_vendita" ? "in_vendita" : "bozza",
                      }),
                    });
                    const data = (await response.json()) as {
                      success?: boolean;
                      message?: string;
                      listing?: { id: string };
                    };
                    if (!response.ok || data.success === false || !data.listing) {
                      throw new Error(data.message || "Operazione non riuscita.");
                    }
                    const file = photoFile;
                    setPhotoFile(null);
                    setCreating(false);
                    setSelectedId(data.listing.id);
                    if (file) {
                      const body = new FormData();
                      body.set("file", file);
                      const uploaded = await fetch(`/api/admin/market/${data.listing.id}/photo`, {
                        method: "POST",
                        body,
                      });
                      await readJson(uploaded);
                    }
                    return;
                  }
                  if (!selected) return;
                  const response = await fetch(`/api/admin/market/${selected.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title: draft.title,
                      description: draft.description,
                      price: draft.price,
                      status: associate ? undefined : draft.status,
                    }),
                  });
                  await readJson(response);
                });
              }}
            >
              <p className="mb-2 text-sm font-medium text-neutral-900">
                {creating ? "Nuovo annuncio associazione" : selected?.title}
              </p>
              {associate && selected ? (
                <p className="mb-2 text-xs text-neutral-500">
                  Associato · {marketHandoverLabel(selected.handover)} · pagamento tra privati.
                  {[selected.sellerPhone, selected.sellerEmail].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={`${fieldClass} min-w-[8rem] flex-1`}
                  value={draft.title}
                  disabled={locked}
                  aria-label="Titolo"
                  placeholder="Titolo"
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                />
                <input
                  className={`${fieldClass} w-24`}
                  value={draft.price}
                  disabled={locked}
                  aria-label="Prezzo"
                  placeholder="Prezzo €"
                  inputMode="decimal"
                  onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))}
                />
                {creating || !associate ? (
                  <select
                    className={`${fieldClass} w-32`}
                    value={draft.status === "in_vendita" ? "in_vendita" : "bozza"}
                    disabled={locked}
                    aria-label="Stato"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        status: event.target.value === "in_vendita" ? "in_vendita" : "bozza",
                      }))
                    }
                  >
                    <option value="bozza">Bozza</option>
                    <option value="in_vendita">In vendita</option>
                  </select>
                ) : (
                  <span className="text-xs text-neutral-500">
                    {selected ? marketListingStatusLabel(selected.status) : ""}
                  </span>
                )}
              </div>
              <textarea
                className="mt-2 min-h-20 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                value={draft.description}
                disabled={locked}
                placeholder="Descrizione"
                aria-label="Descrizione"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, description: event.target.value }))
                }
              />
              <label className="mt-2 block text-xs text-neutral-500">
                Foto
                <input
                  className="mt-1 block text-xs"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  aria-label="Foto"
                  disabled={locked}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    if (creating || !selected) {
                      setPhotoFile(file);
                      return;
                    }
                    void run(async () => {
                      const body = new FormData();
                      body.set("file", file);
                      const response = await fetch(`/api/admin/market/${selected.id}/photo`, {
                        method: "POST",
                        body,
                      });
                      await readJson(response);
                    });
                  }}
                />
                {photoFile ? <span className="mt-1 block">{photoFile.name}</span> : null}
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="submit" className={settingsPrimaryButtonClass} disabled={busy || locked}>
                  Salva
                </button>
                {associate && selected && selected.status !== "venduto" && selected.status !== "riservato" ? (
                  <>
                    {selected.status !== "in_vendita" ? (
                      <button
                        type="button"
                        className={settingsPrimaryButtonClass}
                        disabled={busy}
                        onClick={() => {
                          void run(() => patchStatus(selected.id, "in_vendita"));
                        }}
                      >
                        Approva
                      </button>
                    ) : null}
                    {selected.status !== "rifiutato" ? (
                      <button
                        type="button"
                        className={settingsSecondaryButtonClass}
                        disabled={busy}
                        onClick={() => {
                          void run(() => patchStatus(selected.id, "rifiutato"));
                        }}
                      >
                        Rifiuta
                      </button>
                    ) : null}
                  </>
                ) : null}
                {selected &&
                (selected.status === "bozza" ||
                  selected.status === "in_revisione" ||
                  selected.status === "rifiutato" ||
                  selected.status === "in_vendita") ? (
                  <button
                    type="button"
                    className={settingsSecondaryButtonClass}
                    disabled={busy}
                    onClick={() => {
                      void run(async () => {
                        const response = await fetch(`/api/admin/market/${selected.id}`, {
                          method: "DELETE",
                        });
                        await readJson(response);
                        setSelectedId(null);
                      });
                    }}
                  >
                    Elimina
                  </button>
                ) : null}
              </div>
            </form>
          ) : (
            <p className="text-sm text-neutral-500">Scegli un annuncio o creane uno.</p>
          )}
        </div>
      ) : null}

      {tab === "richieste" ? (
        <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
          {orders.length === 0 ? (
            <li className="px-4 py-6 text-sm text-neutral-500">Nessuna richiesta.</li>
          ) : (
            orders.map((order) => {
              const peer = order.method === "tra_privati";
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
                  </span>
                  {!peer && open && order.method !== "nexi" ? (
                    <button
                      type="button"
                      className={settingsSecondaryButtonClass}
                      disabled={busy}
                      onClick={() => void run(() => patchOrder(order.id, "pagato"))}
                    >
                      Pagato
                    </button>
                  ) : null}
                  {!peer &&
                  (order.status === "pagato" ||
                    (order.method === "contanti" && order.status === "richiesto")) ? (
                    <button
                      type="button"
                      className={settingsPrimaryButtonClass}
                      disabled={busy}
                      onClick={() => void run(() => patchOrder(order.id, "ritirato"))}
                    >
                      Ritirato
                    </button>
                  ) : null}
                  {open ? (
                    <button
                      type="button"
                      className={settingsSecondaryButtonClass}
                      disabled={busy}
                      onClick={() => void run(() => patchOrder(order.id, "annullato"))}
                    >
                      Annulla
                    </button>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      ) : null}

      {tab === "bilancio" ? (
        <div>
          <p className="mb-3 text-sm text-neutral-600">
            Entrate vendite associazione {ledgerYear}:{" "}
            <span className="font-medium text-neutral-900">
              {formatEuro(ledger.reduce((sum, entry) => sum + entry.amountCents, 0) / 100)}
            </span>
          </p>
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
            {ledger.length === 0 ? (
              <li className="px-4 py-6 text-sm text-neutral-500">
                Nessuna vendita dell&apos;associazione in bilancio.
              </li>
            ) : (
              ledger.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-24 shrink-0 text-neutral-500">
                    {new Date(`${entry.entryDate}T12:00:00`).toLocaleDateString("it-IT")}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{entry.description}</span>
                  <span className="shrink-0 text-neutral-500">
                    {entry.method ? marketPayMethodLabel(entry.method) : "—"}
                  </span>
                  <span className="shrink-0 font-medium">{formatEuro(entry.amountCents / 100)}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

async function patchStatus(
  id: string,
  status: "in_vendita" | "rifiutato",
) {
  const response = await fetch(`/api/admin/market/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = (await response.json()) as { success?: boolean; message?: string };
  if (!response.ok || data.success === false) {
    throw new Error(data.message || "Operazione non riuscita.");
  }
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
