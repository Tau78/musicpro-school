"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  previewUrlForToken,
  websiteDocumentsEqual,
  type WebsiteHubDocumentV2,
} from "@musicpro/database";

import { SettingsTabs } from "@/components/admin/settings-chrome";
import { WebsiteHomeEditor } from "@/components/admin/website-home-editor";
import { Field, LinkFields, LinesField } from "@/components/admin/website-fields";

type Tab = "home" | "header" | "pages" | "seo";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "header", label: "Testata" },
  { id: "pages", label: "Pagine" },
  { id: "seo", label: "SEO" },
];

type AdminState = {
  draft: WebsiteHubDocumentV2;
  published: WebsiteHubDocumentV2;
  dirty: boolean;
};

export function WebsiteContentPanel({
  initialDraft,
  initialDirty,
}: {
  initialDraft: WebsiteHubDocumentV2;
  initialDirty: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("home");
  const [form, setForm] = useState<WebsiteHubDocumentV2>(initialDraft);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialDraft.home.blocks[0]?.id ?? null,
  );
  const [previewNonce, setPreviewNonce] = useState(0);
  const [busy, setBusy] = useState<"save" | "publish" | "revert" | "preview" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [iframeOpen, setIframeOpen] = useState(Boolean(initialDraft.previewToken));
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [lastSaved, setLastSaved] = useState<WebsiteHubDocumentV2>(initialDraft);
  const [dirty, setDirty] = useState(initialDirty);
  const unsaved = !websiteDocumentsEqual(form, lastSaved);

  const previewToken = form.previewToken || lastSaved.previewToken;
  const previewHref = previewToken ? previewUrlForToken(previewToken) : "";

  function applyState(state: AdminState) {
    setForm(state.draft);
    setLastSaved(state.draft);
    setDirty(state.dirty);
    if (!state.draft.home.blocks.some((block) => block.id === selectedId)) {
      setSelectedId(state.draft.home.blocks[0]?.id ?? null);
    }
    setPreviewNonce((value) => value + 1);
  }

  useEffect(() => {
    if (!unsaved) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [unsaved]);

  useEffect(() => {
    if (!selectedId) return;
    document
      .getElementById(`cms-block-${selectedId}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    const frame = iframeRef.current;
    if (!frame) return;
    const message = { type: "musicpro-cms", action: "focus", id: selectedId };
    const send = () => {
      try {
        frame.contentWindow?.postMessage(message, "*");
      } catch {
        /* ignore */
      }
    };
    send();
    const timer = window.setTimeout(send, 500);
    return () => window.clearTimeout(timer);
  }, [selectedId, previewNonce, iframeOpen]);

  async function requestJson(
    url: string,
    init?: RequestInit,
  ): Promise<AdminState> {
    const response = await fetch(url, init);
    const data = (await response.json()) as AdminState & {
      ok?: boolean;
      message?: string;
    };
    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Operazione non riuscita.");
    }
    return data;
  }

  async function saveDraft(): Promise<WebsiteHubDocumentV2> {
    const state = await requestJson("/api/admin/website", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    applyState(state);
    return state.draft;
  }

  async function handleSave() {
    setBusy("save");
    setError(null);
    setSuccess(null);
    try {
      await saveDraft();
      setSuccess("Bozza salvata. Il sito pubblico non è cambiato.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore.");
    } finally {
      setBusy(null);
    }
  }

  async function handlePreview() {
    setBusy("preview");
    setError(null);
    setSuccess(null);
    try {
      const draft = unsaved || !previewToken ? await saveDraft() : lastSaved;
      const token = draft.previewToken;
      if (!token) {
        throw new Error("Token anteprima mancante.");
      }
      setIframeOpen(true);
      setPreviewNonce((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore.");
    } finally {
      setBusy(null);
    }
  }

  async function handlePublish() {
    if (!unsaved && !dirty) return;
    const ok = window.confirm(
      "Pubblicare la bozza su www.musicproeventi.it? Il sito live cambia al prossimo caricamento.",
    );
    if (!ok) return;
    setBusy("publish");
    setError(null);
    setSuccess(null);
    try {
      if (unsaved) await saveDraft();
      const state = await requestJson("/api/admin/website/publish", {
        method: "POST",
      });
      applyState(state);
      setSuccess("Pubblicato. www.musicproeventi.it lo legge al prossimo caricamento.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRevert() {
    if (!window.confirm("Sostituire la bozza con quello che è online ora?")) {
      return;
    }
    setBusy("revert");
    setError(null);
    setSuccess(null);
    try {
      const state = await requestJson("/api/admin/website/revert", {
        method: "POST",
      });
      applyState(state);
      setSuccess("Bozza ripristinata dal sito pubblicato.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore.");
    } finally {
      setBusy(null);
    }
  }

  const statusLabel =
    unsaved && dirty
      ? "Modifiche non salvate · Bozza non pubblicata"
      : unsaved
        ? "Modifiche non salvate"
        : dirty
          ? "Bozza salvata · Non pubblicato"
          : "Pubblicato";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Sito hub</h2>
          <p className="mt-1 text-sm text-neutral-600">{statusLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void handleSave()}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
          >
            {busy === "save" ? "Salvo…" : "Salva bozza"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void handlePreview()}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
          >
            {busy === "preview" ? "Apro…" : "Anteprima"}
          </button>
          {dirty || unsaved ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleRevert()}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
            >
              {busy === "revert" ? "Ripristino…" : "Ripristina"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy !== null || (!unsaved && !dirty)}
            onClick={() => void handlePublish()}
            className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
          >
            {busy === "publish" ? "Pubblico…" : "Pubblica"}
          </button>
        </div>
      </div>

      <SettingsTabs tabs={TABS} value={tab} onChange={setTab} />

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="space-y-6">
          {tab === "home" ? (
            <WebsiteHomeEditor
              blocks={form.home.blocks}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={(blocks) =>
                setForm((current) => ({ ...current, home: { blocks } }))
              }
            />
          ) : null}

          {tab === "header" ? (
            <HeaderFields
              form={form}
              onChange={setForm}
            />
          ) : null}

          {tab === "pages" ? <PagesFields form={form} onChange={setForm} /> : null}

          {tab === "seo" ? (
            <div className="space-y-4">
              <Field
                label="Titolo scheda browser"
                value={form.site.seo.title}
                onChange={(title) =>
                  setForm((current) => ({
                    ...current,
                    site: { ...current.site, seo: { ...current.site.seo, title } },
                  }))
                }
              />
              <Field
                label="Descrizione"
                value={form.site.seo.description}
                multiline
                onChange={(description) =>
                  setForm((current) => ({
                    ...current,
                    site: {
                      ...current.site,
                      seo: { ...current.site.seo, description },
                    },
                  }))
                }
              />
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {success ? <p className="text-sm text-green-700">{success}</p> : null}
        </div>

        <div className="mt-8 lg:mt-0 lg:sticky lg:top-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-neutral-800">Anteprima</p>
            {previewHref ? (
              <a
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--brand)] hover:underline"
              >
                Apri in nuova scheda
              </a>
            ) : null}
          </div>
          {unsaved && iframeOpen ? (
            <p className="mb-2 text-sm text-amber-800">
              L’anteprima è la bozza salvata. Salva per vedere queste modifiche.
            </p>
          ) : null}
          {iframeOpen && previewHref ? (
            <iframe
              ref={iframeRef}
              key={`${previewHref}-${previewNonce}`}
              title="Anteprima sito hub"
              src={selectedId ? `${previewHref}#${encodeURIComponent(selectedId)}` : previewHref}
              className="h-[70vh] w-full rounded-xl border border-neutral-200 bg-white"
            />
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-neutral-300 text-sm text-neutral-600">
              Salva la bozza e premi Anteprima.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HeaderFields({
  form,
  onChange,
}: {
  form: WebsiteHubDocumentV2;
  onChange: (form: WebsiteHubDocumentV2) => void;
}) {
  const nav = form.site.nav;
  const contact = form.site.contact;
  const footer = form.site.footer;

  function patchNav(value: Partial<typeof nav>) {
    onChange({ ...form, site: { ...form.site, nav: { ...nav, ...value } } });
  }
  function patchContact(value: Partial<typeof contact>) {
    onChange({
      ...form,
      site: { ...form.site, contact: { ...contact, ...value } },
    });
  }
  function patchFooter(value: Partial<typeof footer>) {
    onChange({
      ...form,
      site: { ...form.site, footer: { ...footer, ...value } },
    });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <p className="text-sm font-medium text-neutral-800">Menu</p>
        <Field label="Marchio in alto" value={nav.brand} onChange={(brand) => patchNav({ brand })} />
        <Field label="Voce Scuola" value={nav.scuola} onChange={(scuola) => patchNav({ scuola })} />
        <Field label="Voce Sale" value={nav.sale} onChange={(sale) => patchNav({ sale })} />
        <Field label="Voce Eventi" value={nav.eventi} onChange={(eventi) => patchNav({ eventi })} />
        <Field label="Voce App" value={nav.app} onChange={(app) => patchNav({ app })} />
        <Field label="Voce ReWavier" value={nav.rewavier} onChange={(rewavier) => patchNav({ rewavier })} />
        <Field label="Voce Contatti" value={nav.contatti} onChange={(contatti) => patchNav({ contatti })} />
        <Field label="Pulsante Iscriviti" value={nav.iscriviti} onChange={(iscriviti) => patchNav({ iscriviti })} />
        <Field label="Link Iscriviti" value={nav.iscrivitiHref} onChange={(iscrivitiHref) => patchNav({ iscrivitiHref })} />
      </div>
      <div className="space-y-4">
        <p className="text-sm font-medium text-neutral-800">Form contatti</p>
        <Field label="Sopratitolo form" value={contact.kicker} onChange={(kicker) => patchContact({ kicker })} />
        <Field label="Etichetta nome" value={contact.name} onChange={(name) => patchContact({ name })} />
        <Field label="Etichetta email" value={contact.email} onChange={(email) => patchContact({ email })} />
        <Field label="Etichetta oggetto" value={contact.subject} onChange={(subject) => patchContact({ subject })} />
        <Field label="Etichetta messaggio" value={contact.body} onChange={(body) => patchContact({ body })} />
        <Field label="Pulsante invia" value={contact.submit} onChange={(submit) => patchContact({ submit })} />
      </div>
      <div className="space-y-4">
        <p className="text-sm font-medium text-neutral-800">Piè di pagina</p>
        <Field label="Riga footer" value={footer.legal} onChange={(legal) => patchFooter({ legal })} />
        <Field label="Shop — testo" value={footer.shopLabel} onChange={(shopLabel) => patchFooter({ shopLabel })} />
        <Field label="Shop — link" value={footer.shopHref} onChange={(shopHref) => patchFooter({ shopHref })} />
        <Field label="Privacy — testo" value={footer.privacyLabel} onChange={(privacyLabel) => patchFooter({ privacyLabel })} />
        <Field label="Privacy — link" value={footer.privacyHref} onChange={(privacyHref) => patchFooter({ privacyHref })} />
      </div>
    </div>
  );
}

function PagesFields({
  form,
  onChange,
}: {
  form: WebsiteHubDocumentV2;
  onChange: (form: WebsiteHubDocumentV2) => void;
}) {
  const kids = form.pages.kids;
  const canto = form.pages.canto;
  const prenota = form.pages.prenota;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <p className="text-sm font-medium text-neutral-800">Kids / propedeutica</p>
        <Field
          label="Titolo scheda"
          value={kids.seoTitle}
          onChange={(seoTitle) =>
            onChange({ ...form, pages: { ...form.pages, kids: { ...kids, seoTitle } } })
          }
        />
        <Field
          label="Descrizione scheda"
          value={kids.seoDescription}
          multiline
          onChange={(seoDescription) =>
            onChange({
              ...form,
              pages: { ...form.pages, kids: { ...kids, seoDescription } },
            })
          }
        />
        <Field
          label="Sopratitolo"
          value={kids.kicker}
          onChange={(kicker) =>
            onChange({ ...form, pages: { ...form.pages, kids: { ...kids, kicker } } })
          }
        />
        <Field
          label="Titolo"
          value={kids.title}
          onChange={(title) =>
            onChange({ ...form, pages: { ...form.pages, kids: { ...kids, title } } })
          }
        />
        <Field
          label="Sottotitolo"
          value={kids.subtitle}
          onChange={(subtitle) =>
            onChange({ ...form, pages: { ...form.pages, kids: { ...kids, subtitle } } })
          }
        />
        <Field
          label="Citazione"
          value={kids.quote}
          onChange={(quote) =>
            onChange({ ...form, pages: { ...form.pages, kids: { ...kids, quote } } })
          }
        />
        <Field
          label="Paragrafo 1"
          value={kids.p1}
          multiline
          onChange={(p1) =>
            onChange({ ...form, pages: { ...form.pages, kids: { ...kids, p1 } } })
          }
        />
        <Field
          label="Paragrafo 2"
          value={kids.p2}
          multiline
          onChange={(p2) =>
            onChange({ ...form, pages: { ...form.pages, kids: { ...kids, p2 } } })
          }
        />
        <Field
          label="Titolo attività"
          value={kids.activitiesTitle}
          onChange={(activitiesTitle) =>
            onChange({
              ...form,
              pages: { ...form.pages, kids: { ...kids, activitiesTitle } },
            })
          }
        />
        <LinesField
          label="Attività"
          value={kids.activities}
          onChange={(activities) =>
            onChange({ ...form, pages: { ...form.pages, kids: { ...kids, activities } } })
          }
        />
        <Field
          label="Pulsante prova"
          value={kids.cta}
          onChange={(cta) =>
            onChange({ ...form, pages: { ...form.pages, kids: { ...kids, cta } } })
          }
        />
      </div>

      <div className="space-y-4">
        <p className="text-sm font-medium text-neutral-800">Canto</p>
        <Field
          label="Titolo scheda"
          value={canto.seoTitle}
          onChange={(seoTitle) =>
            onChange({ ...form, pages: { ...form.pages, canto: { ...canto, seoTitle } } })
          }
        />
        <Field
          label="Descrizione scheda"
          value={canto.seoDescription}
          multiline
          onChange={(seoDescription) =>
            onChange({
              ...form,
              pages: { ...form.pages, canto: { ...canto, seoDescription } },
            })
          }
        />
        <Field
          label="Sopratitolo"
          value={canto.kicker}
          onChange={(kicker) =>
            onChange({ ...form, pages: { ...form.pages, canto: { ...canto, kicker } } })
          }
        />
        <Field
          label="Titolo"
          value={canto.title}
          onChange={(title) =>
            onChange({ ...form, pages: { ...form.pages, canto: { ...canto, title } } })
          }
        />
        <Field
          label="Paragrafo 1"
          value={canto.p1}
          multiline
          onChange={(p1) =>
            onChange({ ...form, pages: { ...form.pages, canto: { ...canto, p1 } } })
          }
        />
        <Field
          label="Paragrafo 2"
          value={canto.p2}
          multiline
          onChange={(p2) =>
            onChange({ ...form, pages: { ...form.pages, canto: { ...canto, p2 } } })
          }
        />
        <LinkFields
          label="Pulsante 1"
          value={canto.cta1}
          onChange={(cta1) =>
            onChange({ ...form, pages: { ...form.pages, canto: { ...canto, cta1 } } })
          }
        />
        <LinkFields
          label="Pulsante 2"
          value={canto.cta2}
          onChange={(cta2) =>
            onChange({ ...form, pages: { ...form.pages, canto: { ...canto, cta2 } } })
          }
        />
      </div>

      <div className="space-y-4">
        <p className="text-sm font-medium text-neutral-800">Come si prenota</p>
        <Field
          label="Titolo scheda"
          value={prenota.seoTitle}
          onChange={(seoTitle) =>
            onChange({
              ...form,
              pages: { ...form.pages, prenota: { ...prenota, seoTitle } },
            })
          }
        />
        <Field
          label="Descrizione scheda"
          value={prenota.seoDescription}
          multiline
          onChange={(seoDescription) =>
            onChange({
              ...form,
              pages: { ...form.pages, prenota: { ...prenota, seoDescription } },
            })
          }
        />
        <Field
          label="Sopratitolo"
          value={prenota.kicker}
          onChange={(kicker) =>
            onChange({ ...form, pages: { ...form.pages, prenota: { ...prenota, kicker } } })
          }
        />
        <Field
          label="Titolo"
          value={prenota.title}
          onChange={(title) =>
            onChange({ ...form, pages: { ...form.pages, prenota: { ...prenota, title } } })
          }
        />
        <Field
          label="Testo"
          value={prenota.lede}
          multiline
          onChange={(lede) =>
            onChange({ ...form, pages: { ...form.pages, prenota: { ...prenota, lede } } })
          }
        />
        <Field
          label="Domanda 1"
          value={prenota.q1}
          onChange={(q1) =>
            onChange({ ...form, pages: { ...form.pages, prenota: { ...prenota, q1 } } })
          }
        />
        <Field
          label="Risposta 1"
          value={prenota.a1}
          multiline
          onChange={(a1) =>
            onChange({ ...form, pages: { ...form.pages, prenota: { ...prenota, a1 } } })
          }
        />
        <Field
          label="Domanda 2"
          value={prenota.q2}
          onChange={(q2) =>
            onChange({ ...form, pages: { ...form.pages, prenota: { ...prenota, q2 } } })
          }
        />
        <Field
          label="Risposta 2"
          value={prenota.a2}
          multiline
          onChange={(a2) =>
            onChange({ ...form, pages: { ...form.pages, prenota: { ...prenota, a2 } } })
          }
        />
        <Field
          label="Domanda 3"
          value={prenota.q3}
          onChange={(q3) =>
            onChange({ ...form, pages: { ...form.pages, prenota: { ...prenota, q3 } } })
          }
        />
        <Field
          label="Risposta 3"
          value={prenota.a3}
          multiline
          onChange={(a3) =>
            onChange({ ...form, pages: { ...form.pages, prenota: { ...prenota, a3 } } })
          }
        />
        <LinkFields
          label="Pulsante 1"
          value={prenota.cta1}
          onChange={(cta1) =>
            onChange({ ...form, pages: { ...form.pages, prenota: { ...prenota, cta1 } } })
          }
        />
        <LinkFields
          label="Pulsante 2"
          value={prenota.cta2}
          onChange={(cta2) =>
            onChange({ ...form, pages: { ...form.pages, prenota: { ...prenota, cta2 } } })
          }
        />
      </div>
    </div>
  );
}
