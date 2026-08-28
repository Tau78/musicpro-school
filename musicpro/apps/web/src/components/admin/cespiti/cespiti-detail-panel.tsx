"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ACCESSORY_TAGS,
  type DuplicateMatch,
  type FixedAsset,
  type FixedAssetEvent,
  type FixedAssetEventType,
  type FixedAssetInput,
  type LocationPreset,
} from "@musicpro/database";

import { CespitiLocationPicker } from "./cespiti-location-picker";

const EVENT_TYPE_OPTIONS: { value: FixedAssetEventType; label: string }[] = [
  { value: "acquisto", label: "Acquisto" },
  { value: "donazione", label: "Donazione" },
  { value: "perdita", label: "Perdita" },
  { value: "smarrimento", label: "Smarrimento" },
  { value: "rottura", label: "Rottura" },
  { value: "trasferimento", label: "Trasferimento" },
];

export interface CespitiAssetWithPhoto extends FixedAsset {
  photoUrl?: string | null;
}

export interface CespitiFormState {
  quantity: number;
  name: string;
  brand: string;
  model: string;
  serial: string;
  accessories: string[];
  purchasedAt: string;
  locationPreset: LocationPreset | null;
  locationCustom: string;
  notes: string;
  photoStoragePath: string | null;
  photoUrl: string | null;
}

export function emptyCespitiForm(): CespitiFormState {
  return {
    quantity: 1,
    name: "",
    brand: "",
    model: "",
    serial: "",
    accessories: [],
    purchasedAt: "",
    locationPreset: null,
    locationCustom: "",
    notes: "",
    photoStoragePath: null,
    photoUrl: null,
  };
}

export function assetToForm(asset: CespitiAssetWithPhoto): CespitiFormState {
  return {
    quantity: asset.quantity,
    name: asset.name,
    brand: asset.brand ?? "",
    model: asset.model ?? "",
    serial: asset.serial ?? "",
    accessories: [...asset.accessories],
    purchasedAt: asset.purchasedAt ?? "",
    locationPreset: asset.locationPreset,
    locationCustom: asset.locationCustom ?? "",
    notes: asset.notes ?? "",
    photoStoragePath: asset.photoStoragePath,
    photoUrl: asset.photoUrl ?? null,
  };
}

function formToInput(form: CespitiFormState): FixedAssetInput {
  return {
    quantity: form.quantity,
    name: form.name,
    brand: form.brand || null,
    model: form.model || null,
    serial: form.serial || null,
    accessories: form.accessories,
    purchasedAt: form.purchasedAt || null,
    locationPreset: form.locationPreset,
    locationCustom: form.locationCustom || null,
    notes: form.notes || null,
  };
}

interface CespitiDetailPanelProps {
  mode: "add" | "edit";
  assetId: string | null;
  initialForm?: CespitiFormState;
  isAdmin: boolean;
  memberId: string;
  onClose: () => void;
  onSaved: (id: string) => void;
  onOpenMatch: (id: string) => void;
  onDeleted: () => void;
}

export function CespitiDetailPanel({
  mode,
  assetId,
  initialForm,
  isAdmin,
  memberId,
  onClose,
  onSaved,
  onOpenMatch,
  onDeleted,
}: CespitiDetailPanelProps) {
  const [form, setForm] = useState<CespitiFormState>(
    initialForm ?? emptyCespitiForm(),
  );
  const [events, setEvents] = useState<FixedAssetEvent[]>([]);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>(
    [],
  );
  const [showActions, setShowActions] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [newEventType, setNewEventType] =
    useState<FixedAssetEventType>("acquisto");
  const [newEventDate, setNewEventDate] = useState("");
  const [newEventNotes, setNewEventNotes] = useState("");
  const [newEventVerbale, setNewEventVerbale] = useState("");
  const [addingEvent, setAddingEvent] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const pendingPhotoRef = useRef<File | null>(null);

  const loadDetail = useCallback(async () => {
    if (!assetId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/documenti/cespiti/${assetId}`);
      const data = (await response.json()) as {
        success?: boolean;
        asset?: CespitiAssetWithPhoto;
        events?: FixedAssetEvent[];
        message?: string;
      };

      if (!response.ok || !data.success || !data.asset) {
        throw new Error(data.message ?? "Impossibile caricare il cespite.");
      }

      setForm(assetToForm(data.asset));
      setEvents(data.events ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossibile caricare il cespite.",
      );
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    if (mode === "add") {
      setForm(initialForm ?? emptyCespitiForm());
      setEvents([]);
      setDuplicateMatches([]);
      setError(null);
      setLoading(false);
      pendingPhotoRef.current = null;
      return;
    }

    if (assetId) {
      void loadDetail();
    }
  }, [mode, assetId, loadDetail, initialForm]);

  async function uploadPendingPhoto(id: string): Promise<{
    photoStoragePath?: string;
    photoUrl?: string | null;
  }> {
    const file = pendingPhotoRef.current;
    if (!file) return {};

    const body = new FormData();
    body.append("file", file);

    const response = await fetch(`/api/admin/documenti/cespiti/${id}/photo`, {
      method: "POST",
      body,
    });
    const data = (await response.json()) as {
      success?: boolean;
      photoStoragePath?: string;
      photoUrl?: string | null;
      message?: string;
    };

    pendingPhotoRef.current = null;

    if (!response.ok || !data.success) {
      throw new Error(data.message ?? "Caricamento foto non riuscito.");
    }

    return data;
  }

  function updateForm(patch: Partial<CespitiFormState>) {
    setForm((current) => ({ ...current, ...patch }));
    setDuplicateMatches([]);
  }

  function toggleAccessory(key: string) {
    setForm((current) => {
      const next = current.accessories.includes(key)
        ? current.accessories.filter((item) => item !== key)
        : [...current.accessories, key];
      return { ...current, accessories: next.sort() };
    });
    setDuplicateMatches([]);
  }

  async function handlePhotoSelected(file: File | null) {
    if (!file) return;

    if (mode === "add" || !assetId) {
      pendingPhotoRef.current = file;
      const previewUrl = URL.createObjectURL(file);
      updateForm({ photoUrl: previewUrl });
      return;
    }

    setUploadingPhoto(true);
    setError(null);

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch(
        `/api/admin/documenti/cespiti/${assetId}/photo`,
        { method: "POST", body },
      );
      const data = (await response.json()) as {
        success?: boolean;
        photoStoragePath?: string;
        photoUrl?: string | null;
        message?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.message ?? "Caricamento foto non riuscito.");
      }

      updateForm({
        photoStoragePath: data.photoStoragePath ?? form.photoStoragePath,
        photoUrl: data.photoUrl ?? null,
      });
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Caricamento foto non riuscito.",
      );
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave(forceDuplicate = false) {
    setSaving(true);
    setError(null);

    const input = formToInput(form);
    const payload = { ...input, forceDuplicate };

    try {
      const response = await fetch(
        mode === "add"
          ? "/api/admin/documenti/cespiti"
          : `/api/admin/documenti/cespiti/${assetId}`,
        {
          method: mode === "add" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const data = (await response.json()) as {
        success?: boolean;
        id?: string;
        duplicates?: DuplicateMatch[];
        duplicateMatches?: DuplicateMatch[];
        message?: string;
      };

      if (!response.ok || !data.success) {
        const matches = data.duplicateMatches ?? data.duplicates;
        if (matches?.length) {
          setDuplicateMatches(matches);
          return;
        }
        throw new Error(data.message ?? "Salvataggio non riuscito.");
      }

      setDuplicateMatches([]);
      const savedId = data.id ?? assetId ?? "";
      if (mode === "add" && savedId) {
        try {
          const photoData = await uploadPendingPhoto(savedId);
          if (photoData.photoUrl) {
            updateForm({
              photoStoragePath: photoData.photoStoragePath ?? null,
              photoUrl: photoData.photoUrl,
            });
          }
        } catch (photoError) {
          setError(
            photoError instanceof Error
              ? photoError.message
              : "Cespite salvato, ma caricamento foto non riuscito.",
          );
        }
      }
      onSaved(savedId);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Salvataggio non riuscito.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleMergeQuantity(targetId: string) {
    if (!assetId && mode !== "add") return;

    setSaving(true);
    setError(null);

    try {
      let currentId = assetId;

      if (mode === "add") {
        const createResponse = await fetch("/api/admin/documenti/cespiti", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...formToInput(form), forceDuplicate: true }),
        });
        const createData = (await createResponse.json()) as {
          success?: boolean;
          id?: string;
          message?: string;
        };
        if (!createResponse.ok || !createData.success || !createData.id) {
          throw new Error(createData.message ?? "Creazione non riuscita.");
        }
        currentId = createData.id;
      }

      const response = await fetch("/api/admin/documenti/cespiti/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, sourceId: currentId }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.message ?? "Unione quantità non riuscita.");
      }

      setDuplicateMatches([]);
      onSaved(targetId);
    } catch (mergeError) {
      setError(
        mergeError instanceof Error
          ? mergeError.message
          : "Unione quantità non riuscita.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: "duplicate" | "dispose" | "soft" | "hard") {
    if (!assetId) return;

    const messages: Record<typeof action, string> = {
      duplicate: "Duplicare questo cespite?",
      dispose: "Segnare come dismesso?",
      soft: "Eliminare questo cespite (soft delete)?",
      hard: "Eliminare DEFINITIVAMENTE questo cespite?",
    };

    if (!window.confirm(messages[action])) return;

    setSaving(true);
    setError(null);
    setShowActions(false);

    try {
      if (action === "duplicate") {
        const response = await fetch(
          `/api/admin/documenti/cespiti/${assetId}/duplicate`,
          { method: "POST" },
        );
        const data = (await response.json()) as {
          success?: boolean;
          id?: string;
          message?: string;
        };
        if (!response.ok || !data.success || !data.id) {
          throw new Error(data.message ?? "Duplicazione non riuscita.");
        }
        onSaved(data.id);
        return;
      }

      if (action === "dispose") {
        const response = await fetch(
          `/api/admin/documenti/cespiti/${assetId}/dispose`,
          { method: "POST" },
        );
        const data = (await response.json()) as {
          success?: boolean;
          message?: string;
        };
        if (!response.ok || !data.success) {
          throw new Error(data.message ?? "Operazione non riuscita.");
        }
        onSaved(assetId);
        return;
      }

      const hard = action === "hard";
      const response = await fetch(
        `/api/admin/documenti/cespiti/${assetId}${hard ? "?mode=hard" : ""}`,
        { method: "DELETE" },
      );
      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
      };
      if (!response.ok || !data.success) {
        throw new Error(data.message ?? "Eliminazione non riuscita.");
      }
      onDeleted();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Operazione non riuscita.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAddEvent(event: React.FormEvent) {
    event.preventDefault();
    if (!assetId) return;

    setAddingEvent(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/documenti/cespiti/${assetId}/events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: newEventType,
            eventDate: newEventDate || null,
            notes: newEventNotes || null,
            verbaleRef: newEventVerbale || null,
            createdBy: memberId,
          }),
        },
      );
      const data = (await response.json()) as {
        success?: boolean;
        events?: FixedAssetEvent[];
        message?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.message ?? "Evento non registrato.");
      }

      const eventsResponse = await fetch(
        `/api/admin/documenti/cespiti/${assetId}/events`,
      );
      const eventsData = (await eventsResponse.json()) as {
        success?: boolean;
        events?: FixedAssetEvent[];
      };
      if (eventsResponse.ok && eventsData.success) {
        setEvents(eventsData.events ?? []);
      }
      setNewEventNotes("");
      setNewEventVerbale("");
      setNewEventDate("");
    } catch (eventError) {
      setError(
        eventError instanceof Error
          ? eventError.message
          : "Evento non registrato.",
      );
    } finally {
      setAddingEvent(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <h3 className="text-base font-semibold text-[var(--brand)]">
          {mode === "add" ? "Nuovo cespite" : "Dettaglio cespite"}
        </h3>
        <div className="flex items-center gap-1">
          {mode === "edit" && assetId ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowActions((current) => !current)}
                className="min-h-[44px] min-w-[44px] rounded-lg px-3 text-sm text-neutral-600 touch-manipulation hover:bg-neutral-50"
                aria-label="Azioni"
              >
                ⋮
              </button>
              {showActions ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-10"
                    aria-label="Chiudi menu"
                    onClick={() => setShowActions(false)}
                  />
                  <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
                    <button
                      type="button"
                      onClick={() => void runAction("duplicate")}
                      className="block w-full px-4 py-3 text-left text-sm touch-manipulation hover:bg-neutral-50"
                    >
                      Duplica
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction("dispose")}
                      className="block w-full px-4 py-3 text-left text-sm touch-manipulation hover:bg-neutral-50"
                    >
                      Segna dismesso
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction("soft")}
                      className="block w-full px-4 py-3 text-left text-sm text-amber-800 touch-manipulation hover:bg-amber-50"
                    >
                      Soft delete
                    </button>
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => void runAction("hard")}
                        className="block w-full px-4 py-3 text-left text-sm text-red-700 touch-manipulation hover:bg-red-50"
                      >
                        Hard delete
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-lg px-3 text-sm text-neutral-600 touch-manipulation hover:bg-neutral-50"
          >
            Chiudi
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="text-sm text-neutral-500">Caricamento…</p>
        ) : (
          <div className="space-y-5">
            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div>
              <span className="text-xs font-medium text-neutral-600">Foto</span>
              <div className="mt-2 flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => form.photoUrl && setLightboxOpen(true)}
                  className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 touch-manipulation"
                >
                  {form.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.photoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-neutral-400">Nessuna</span>
                  )}
                </button>
                <div className="space-y-2">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) =>
                      void handlePhotoSelected(event.target.files?.[0] ?? null)
                    }
                  />
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => photoInputRef.current?.click()}
                    className="min-h-[44px] rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 touch-manipulation hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {uploadingPhoto ? "Caricamento…" : "Carica / scatta foto"}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-neutral-600">Nome *</span>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(event) => updateForm({ name: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Marca</span>
                <input
                  type="text"
                  value={form.brand}
                  onChange={(event) => updateForm({ brand: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Modello</span>
                <input
                  type="text"
                  value={form.model}
                  onChange={(event) => updateForm({ model: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Seriale</span>
                <input
                  type="text"
                  value={form.serial}
                  onChange={(event) => updateForm({ serial: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Quantità</span>
                <input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(event) =>
                    updateForm({ quantity: Number(event.target.value) || 1 })
                  }
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                />
              </label>
            </div>

            <div>
              <span className="text-xs font-medium text-neutral-600">Ubicazione</span>
              <div className="mt-2">
                <CespitiLocationPicker
                  value={form.locationPreset}
                  customValue={form.locationCustom}
                  onChange={(preset, custom) =>
                    updateForm({
                      locationPreset: preset,
                      locationCustom: custom,
                    })
                  }
                />
              </div>
            </div>

            <div>
              <span className="text-xs font-medium text-neutral-600">Accessori</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {ACCESSORY_TAGS.map((tag) => {
                  const selected = form.accessories.includes(tag.key);
                  return (
                    <button
                      key={tag.key}
                      type="button"
                      onClick={() => toggleAccessory(tag.key)}
                      className={`min-h-[36px] rounded-full border px-3 py-1 text-xs font-medium touch-manipulation ${
                        selected
                          ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
                          : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                      }`}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-neutral-600">
                Data acquisto
              </span>
              <input
                type="date"
                value={form.purchasedAt}
                onChange={(event) =>
                  updateForm({ purchasedAt: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-neutral-600">Note</span>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(event) => updateForm({ notes: event.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
              />
            </label>

            {duplicateMatches.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                <p className="text-sm font-medium text-amber-900">
                  Possibili duplicati
                </p>
                <ul className="mt-2 space-y-2">
                  {duplicateMatches.map((match) => (
                    <li
                      key={match.asset.id}
                      className="rounded-lg border border-amber-100 bg-white px-3 py-2"
                    >
                      <p className="text-sm text-neutral-800">{match.message}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {match.asset.name} — qty {match.asset.quantity}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenMatch(match.asset.id)}
                          className="min-h-[36px] rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium touch-manipulation hover:bg-neutral-50"
                        >
                          Apri corrispondenza
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSave(true)}
                          disabled={saving}
                          className="min-h-[36px] rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium touch-manipulation hover:bg-neutral-50 disabled:opacity-50"
                        >
                          Forza nuovo
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleMergeQuantity(match.asset.id)}
                          disabled={saving}
                          className="min-h-[36px] rounded-lg bg-[var(--brand)] px-3 py-1 text-xs font-medium text-white touch-manipulation hover:opacity-95 disabled:opacity-50"
                        >
                          Unisci qty
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {mode === "edit" && assetId ? (
              <section className="border-t border-neutral-100 pt-4">
                <h4 className="text-sm font-semibold text-neutral-800">Eventi</h4>
                {events.length === 0 ? (
                  <p className="mt-2 text-sm text-neutral-500">
                    Nessun evento registrato.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {events.map((event) => (
                      <li
                        key={event.id}
                        className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-neutral-800">
                          {
                            EVENT_TYPE_OPTIONS.find(
                              (item) => item.value === event.eventType,
                            )?.label
                          }
                          {event.eventDate
                            ? ` — ${new Date(event.eventDate).toLocaleDateString("it-IT")}`
                            : ""}
                        </p>
                        {event.notes ? (
                          <p className="mt-0.5 text-neutral-600">{event.notes}</p>
                        ) : null}
                        {event.verbaleRef ? (
                          <p className="mt-0.5 text-xs text-neutral-500">
                            Verbale: {event.verbaleRef}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}

                <form
                  onSubmit={(event) => void handleAddEvent(event)}
                  className="mt-4 space-y-3 rounded-lg border border-neutral-200 bg-white p-3"
                >
                  <p className="text-xs font-medium text-neutral-600">
                    Aggiungi evento
                  </p>
                  <select
                    value={newEventType}
                    onChange={(event) =>
                      setNewEventType(event.target.value as FixedAssetEventType)
                    }
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                  >
                    {EVENT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={newEventDate}
                    onChange={(event) => setNewEventDate(event.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                  />
                  <input
                    type="text"
                    value={newEventVerbale}
                    onChange={(event) => setNewEventVerbale(event.target.value)}
                    placeholder="Rif. verbale (opzionale)"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                  />
                  <textarea
                    rows={2}
                    value={newEventNotes}
                    onChange={(event) => setNewEventNotes(event.target.value)}
                    placeholder="Note evento"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                  />
                  <button
                    type="submit"
                    disabled={addingEvent}
                    className="min-h-[44px] rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white touch-manipulation hover:opacity-95 disabled:opacity-50"
                  >
                    {addingEvent ? "Registrazione…" : "Aggiungi evento"}
                  </button>
                </form>
              </section>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-neutral-100 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] flex-1 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 touch-manipulation hover:bg-neutral-50"
        >
          Annulla
        </button>
        <button
          type="button"
          disabled={saving || loading || !form.name.trim()}
          onClick={() => void handleSave()}
          className="min-h-[44px] flex-1 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white touch-manipulation hover:opacity-95 disabled:opacity-50"
        >
          {saving ? "Salvataggio…" : "Salva"}
        </button>
      </div>

      {lightboxOpen && form.photoUrl ? (
        <button
          type="button"
          aria-label="Chiudi anteprima"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 touch-manipulation"
          onClick={() => setLightboxOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={form.photoUrl}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </button>
      ) : null}
    </div>
  );
}
