"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  formatEuro,
  marketHandoverLabel,
  marketListingStatusLabel,
  marketPhotoPublicUrl,
  type MarketHandover,
  type MarketListing,
} from "@musicpro/database";

const fieldClass =
  "h-9 rounded-lg border border-neutral-300 px-2 text-sm text-neutral-900 focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

const primaryClass =
  "rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60";

const secondaryClass =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";

type Tab = "annunci" | "miei";

type Draft = {
  title: string;
  price: string;
  description: string;
  phone: string;
  email: string;
  handover: MarketHandover;
};

export function MarketBoard({
  catalog,
  mine,
  supabaseUrl,
  defaultPhone,
  defaultEmail,
}: {
  catalog: MarketListing[];
  mine: MarketListing[];
  supabaseUrl: string;
  defaultPhone: string;
  defaultEmail: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("annunci");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    title: "",
    price: "",
    description: "",
    phone: defaultPhone,
    email: defaultEmail,
    handover: "sede",
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const editing = mine.find((item) => item.id === editingId) ?? null;
  const locked = editing?.status === "venduto";

  function blankDraft(): Draft {
    return {
      title: "",
      price: "",
      description: "",
      phone: defaultPhone,
      email: defaultEmail,
      handover: "sede",
    };
  }

  async function readJson(response: Response) {
    const data = (await response.json()) as { success?: boolean; message?: string };
    if (!response.ok || data.success === false) {
      throw new Error(data.message || "Operazione non riuscita.");
    }
    return data;
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

  function openMine(item: MarketListing) {
    setCreating(false);
    setPhotoFile(null);
    setEditingId(item.id);
    setDraft({
      title: item.title,
      price: (item.priceCents / 100).toFixed(2).replace(".", ","),
      description: item.description,
      phone: item.sellerPhone ?? "",
      email: item.sellerEmail ?? "",
      handover: item.handover === "diretto" ? "diretto" : "sede",
    });
  }

  return (
    <div>
      <div className="mb-4 flex gap-4 border-b border-neutral-200">
        {(
          [
            ["annunci", "Annunci"],
            ["miei", "I miei"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`border-b-2 pb-2 text-sm font-medium ${
              tab === id
                ? "border-[var(--brand-accent)] text-[var(--brand)]"
                : "border-transparent text-neutral-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {notice ? <p className="mb-3 text-sm text-neutral-600">{notice}</p> : null}

      {tab === "annunci" ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {catalog.length === 0 ? (
            <li className="text-sm text-neutral-500">Nessun annuncio in vendita.</li>
          ) : (
            catalog.map((item) => {
              const photo = marketPhotoPublicUrl(item.photoPath, supabaseUrl);
              const peer = item.sellerKind === "associato";
              return (
                <li key={item.id} className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  {photo ? (
                    <img src={photo} alt="" className="h-40 w-full object-cover" />
                  ) : (
                    <div className="h-24 bg-neutral-100" />
                  )}
                  <div className="p-3">
                    <p className="font-medium text-neutral-900">{item.title}</p>
                    <p className="text-sm text-neutral-900">{formatEuro(item.priceCents / 100)}</p>
                    {item.description ? (
                      <p className="mt-1 line-clamp-3 text-sm text-neutral-600">{item.description}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-neutral-500">
                      {peer
                        ? `${item.sellerName || "Associato"} · ${marketHandoverLabel(item.handover)} · vi accordate tra voi`
                        : "Associazione · ritiro in sede"}
                    </p>
                    {peer ? (
                      <p className="mt-1 text-xs text-neutral-700">
                        {[item.sellerPhone, item.sellerEmail].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      ) : null}

      {tab === "miei" ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                className={primaryClass}
                onClick={() => {
                  setCreating(true);
                  setEditingId(null);
                  setPhotoFile(null);
                  setDraft(blankDraft());
                }}
              >
                Nuovo annuncio
              </button>
            </div>
            <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
              {mine.length === 0 ? (
                <li className="px-4 py-6 text-sm text-neutral-500">Non hai annunci.</li>
              ) : (
                mine.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openMine(item)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                        item.id === editingId ? "bg-neutral-50" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-neutral-900">
                          {item.title}
                        </span>
                        <span className="block text-xs text-neutral-500">
                          {marketListingStatusLabel(item.status)} · {marketHandoverLabel(item.handover)}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-medium">
                        {formatEuro(item.priceCents / 100)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          {creating || editing ? (
            <form
              className="rounded-xl border border-neutral-200 bg-white p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const payload = {
                    title: draft.title,
                    price: draft.price,
                    description: draft.description,
                    phone: draft.phone,
                    email: draft.email,
                    handover: draft.handover,
                  };
                  if (creating) {
                    const response = await fetch("/api/dashboard/market", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload),
                    });
                    const data = (await response.json()) as {
                      success?: boolean;
                      message?: string;
                      listing?: { id: string };
                    };
                    if (!response.ok || data.success === false || !data.listing) {
                      throw new Error(data.message || "Invio non riuscito.");
                    }
                    const file = photoFile;
                    setCreating(false);
                    setPhotoFile(null);
                    setNotice("Annuncio inviato. La segreteria lo pubblica dopo il controllo.");
                    if (file) {
                      const body = new FormData();
                      body.set("file", file);
                      const uploaded = await fetch(
                        `/api/dashboard/market/${data.listing.id}/photo`,
                        { method: "POST", body },
                      );
                      await readJson(uploaded);
                    }
                    return;
                  }
                  if (!editing) return;
                  const response = await fetch(`/api/dashboard/market/${editing.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  await readJson(response);
                  setNotice("Modifica inviata. L'annuncio torna in revisione.");
                });
              }}
            >
              <p className="mb-2 text-sm text-neutral-600">
                Il pagamento resta tra te e l&apos;acquirente. L&apos;associazione non incassa.
              </p>
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
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  className={`${fieldClass} min-w-[8rem] flex-1`}
                  value={draft.phone}
                  disabled={locked}
                  aria-label="Telefono"
                  placeholder="Telefono"
                  inputMode="tel"
                  onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
                />
                <input
                  className={`${fieldClass} min-w-[10rem] flex-1`}
                  value={draft.email}
                  disabled={locked}
                  aria-label="Email"
                  placeholder="Email"
                  inputMode="email"
                  onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-neutral-800">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="handover"
                    checked={draft.handover === "sede"}
                    disabled={locked}
                    onChange={() => setDraft((current) => ({ ...current, handover: "sede" }))}
                  />
                  Lo lascio in sede
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="handover"
                    checked={draft.handover === "diretto"}
                    disabled={locked}
                    onChange={() => setDraft((current) => ({ ...current, handover: "diretto" }))}
                  />
                  Consegna mia
                </label>
              </div>
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
                    if (creating || !editing) {
                      setPhotoFile(file);
                      return;
                    }
                    void run(async () => {
                      const body = new FormData();
                      body.set("file", file);
                      const response = await fetch(`/api/dashboard/market/${editing.id}/photo`, {
                        method: "POST",
                        body,
                      });
                      await readJson(response);
                      setNotice("Foto aggiornata. L'annuncio torna in revisione.");
                    });
                  }}
                />
                {photoFile ? <span className="mt-1 block">{photoFile.name}</span> : null}
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="submit" className={primaryClass} disabled={busy || locked}>
                  {creating ? "Invia in revisione" : "Salva"}
                </button>
                {editing && editing.status !== "venduto" ? (
                  <button
                    type="button"
                    className={secondaryClass}
                    disabled={busy}
                    onClick={() => {
                      void run(async () => {
                        const response = await fetch(`/api/dashboard/market/${editing.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ sold: true }),
                        });
                        await readJson(response);
                        setNotice("Annuncio segnato come venduto.");
                      });
                    }}
                  >
                    Segna venduto
                  </button>
                ) : null}
                {editing && editing.status !== "venduto" ? (
                  <button
                    type="button"
                    className={secondaryClass}
                    disabled={busy}
                    onClick={() => {
                      void run(async () => {
                        const response = await fetch(`/api/dashboard/market/${editing.id}`, {
                          method: "DELETE",
                        });
                        await readJson(response);
                        setEditingId(null);
                      });
                    }}
                  >
                    Elimina
                  </button>
                ) : null}
              </div>
            </form>
          ) : (
            <p className="text-sm text-neutral-500">Scegli un tuo annuncio o creane uno.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
