"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  LOCATION_PRESETS,
  LOCATION_PRESET_LABELS,
  type FixedAsset,
  type LocationPreset,
} from "@musicpro/database";

import {
  CespitiDetailPanel,
  type CespitiAssetWithPhoto,
} from "./cespiti-detail-panel";
import { CespitiFab } from "./cespiti-fab";
import {
  activeFilterCount,
  CespitiFiltersDrawer,
  emptyCespitiFilters,
  type CespitiFilters,
} from "./cespiti-filters-drawer";
import { locationShortLabel } from "./cespiti-location-picker";

export type CespitiSortMode = "sala" | "name" | "date";

interface CespitiPanelProps {
  initialAssets: CespitiAssetWithPhoto[];
  isAdmin: boolean;
  memberId: string;
}

function assetStatus(asset: FixedAsset): {
  label: string;
  className: string;
} {
  if (asset.deletedAt) {
    return {
      label: "Eliminato",
      className: "bg-neutral-200 text-neutral-700",
    };
  }
  if (asset.disposedAt) {
    return {
      label: "Dismesso",
      className: "bg-amber-100 text-amber-900",
    };
  }
  return {
    label: "Attivo",
    className: "bg-emerald-100 text-emerald-900",
  };
}

function truncateSerial(serial: string | null, max = 14): string {
  if (!serial) return "—";
  if (serial.length <= max) return serial;
  return `${serial.slice(0, max)}…`;
}

function buildListQuery(
  search: string,
  filters: CespitiFilters,
): string {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  for (const location of filters.locations) {
    params.append("location", location);
  }
  if (filters.includeDisposed) params.set("includeDisposed", "true");
  if (filters.includeDeleted) params.set("includeDeleted", "true");
  if (filters.withoutPhoto) params.set("withoutPhoto", "true");
  if (filters.withoutSerial) params.set("withoutSerial", "true");
  return params.toString();
}

function sortAssets(
  assets: CespitiAssetWithPhoto[],
  mode: CespitiSortMode,
): CespitiAssetWithPhoto[] {
  const copy = [...assets];

  if (mode === "name") {
    return copy.sort((a, b) =>
      a.name.localeCompare(b.name, "it", { sensitivity: "base" }),
    );
  }

  if (mode === "date") {
    return copy.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  return copy.sort((a, b) => {
    const rank = (preset: LocationPreset | null) => {
      if (preset == null) return LOCATION_PRESETS.length;
      const index = LOCATION_PRESETS.indexOf(preset);
      return index >= 0 ? index : LOCATION_PRESETS.length;
    };
    const diff = rank(a.locationPreset) - rank(b.locationPreset);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, "it", { sensitivity: "base" });
  });
}

function groupByLocation(
  assets: CespitiAssetWithPhoto[],
): { key: string; label: string; items: CespitiAssetWithPhoto[] }[] {
  const groups = new Map<string, CespitiAssetWithPhoto[]>();

  for (const asset of assets) {
    const key = asset.locationPreset ?? "__none__";
    const current = groups.get(key) ?? [];
    current.push(asset);
    groups.set(key, current);
  }

  const orderedKeys = [
    ...LOCATION_PRESETS,
    "__none__",
  ].filter((key) => groups.has(key));

  return orderedKeys.map((key) => ({
    key,
    label:
      key === "__none__"
        ? "Senza sala"
        : LOCATION_PRESET_LABELS[key as LocationPreset],
    items: [...(groups.get(key) ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name, "it", { sensitivity: "base" }),
    ),
  }));
}

export function CespitiPanel({
  initialAssets,
  isAdmin,
  memberId,
}: CespitiPanelProps) {
  const [assets, setAssets] = useState(initialAssets);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<CespitiFilters>(emptyCespitiFilters());
  const [sortMode, setSortMode] = useState<CespitiSortMode>("sala");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<"add" | "edit">("edit");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const query = buildListQuery(search, filters);
      const response = await fetch(
        `/api/admin/documenti/cespiti${query ? `?${query}` : ""}`,
      );
      const data = (await response.json()) as {
        success?: boolean;
        assets?: CespitiAssetWithPhoto[];
        message?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.message ?? "Impossibile caricare i cespiti.");
      }

      setAssets(data.assets ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossibile caricare i cespiti.",
      );
    } finally {
      setLoading(false);
    }
  }, [search, filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAssets();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadAssets]);

  const sortedAssets = useMemo(
    () => sortAssets(assets, sortMode),
    [assets, sortMode],
  );

  const groupedAssets = useMemo(() => {
    if (sortMode !== "sala") {
      return [{ key: "all", label: "", items: sortedAssets }];
    }
    return groupByLocation(sortedAssets);
  }, [sortedAssets, sortMode]);

  function openAddPanel() {
    setPanelMode("add");
    setSelectedId(null);
    setPanelOpen(true);
  }

  function openEditPanel(id: string) {
    setPanelMode("edit");
    setSelectedId(id);
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setSelectedId(null);
  }

  async function handleSaved(id: string) {
    await loadAssets();
    setPanelMode("edit");
    setSelectedId(id);
    setPanelOpen(true);
  }

  async function handleDeleted() {
    closePanel();
    await loadAssets();
  }

  const filterBadge = activeFilterCount(filters);

  return (
    <div className="relative">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca per nome, marca, seriale…"
            className="min-h-[44px] w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
          />
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="relative min-h-[44px] min-w-[44px] shrink-0 rounded-lg border border-neutral-300 px-3 text-sm touch-manipulation hover:bg-neutral-50"
            aria-label="Filtri"
          >
            ☰
            {filterBadge > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand)] text-[10px] font-semibold text-white">
                {filterBadge}
              </span>
            ) : null}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <span className="sr-only">Ordina per</span>
            <select
              value={sortMode}
              onChange={(event) =>
                setSortMode(event.target.value as CespitiSortMode)
              }
              className="min-h-[44px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            >
              <option value="sala">Ordina: sala</option>
              <option value="name">Ordina: nome</option>
              <option value="date">Ordina: data</option>
            </select>
          </label>
          <a
            href="/api/admin/documenti/cespiti/export?format=html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 touch-manipulation hover:bg-neutral-50"
          >
            Esporta
          </a>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div
        className={`relative flex min-h-[calc(100dvh-14rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white ${
          panelOpen ? "md:flex-row" : ""
        }`}
      >
        <div
          className={`min-w-0 overflow-y-auto ${
            panelOpen
              ? "hidden md:block md:w-[55%] md:border-r md:border-neutral-100"
              : "w-full"
          }`}
        >
          {loading ? (
            <p className="px-4 py-6 text-sm text-neutral-500">Caricamento…</p>
          ) : sortedAssets.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-neutral-500">
              Nessun cespite trovato.
            </p>
          ) : (
            groupedAssets.map((group) => (
              <section key={group.key}>
                {group.label ? (
                  <div className="sticky top-0 z-10 border-b border-neutral-100 bg-neutral-50 px-3 py-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
                      {group.label}
                    </h4>
                  </div>
                ) : null}

                <table className="w-full table-fixed text-sm">
                  <thead className="sr-only">
                    <tr>
                      <th>Foto</th>
                      <th>Nome</th>
                      <th>Marca/Modello</th>
                      <th>Qty</th>
                      <th>Seriale</th>
                      <th>Sala</th>
                      <th>Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((asset) => {
                      const status = assetStatus(asset);
                      const selected = selectedId === asset.id && panelOpen;

                      return (
                        <tr
                          key={asset.id}
                          onClick={() => openEditPanel(asset.id)}
                          className={`cursor-pointer border-b border-neutral-100 touch-manipulation hover:bg-neutral-50 ${
                            selected ? "bg-[var(--brand)]/5" : ""
                          }`}
                        >
                          <td className="w-12 px-2 py-2 align-middle">
                            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-neutral-50">
                              {asset.photoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={asset.photoUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="text-[10px] text-neutral-400">
                                  —
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="min-w-0 px-2 py-2 align-middle">
                            <span className="block truncate font-medium text-neutral-900">
                              {asset.name}
                            </span>
                          </td>
                          <td className="hidden min-w-0 px-2 py-2 align-middle sm:table-cell">
                            <span className="block truncate text-neutral-600">
                              {[asset.brand, asset.model]
                                .filter(Boolean)
                                .join(" ") || "—"}
                            </span>
                          </td>
                          <td className="w-10 px-2 py-2 text-center align-middle text-neutral-700">
                            {asset.quantity}
                          </td>
                          <td className="hidden min-w-0 px-2 py-2 align-middle md:table-cell">
                            <span className="block truncate font-mono text-xs text-neutral-600">
                              {truncateSerial(asset.serial)}
                            </span>
                          </td>
                          <td className="hidden min-w-0 px-2 py-2 align-middle lg:table-cell">
                            <span className="block truncate text-neutral-600">
                              {locationShortLabel(
                                asset.locationPreset,
                                asset.locationCustom,
                              )}
                            </span>
                          </td>
                          <td className="w-24 px-2 py-2 align-middle">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}
                            >
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ))
          )}
        </div>

        {panelOpen ? (
          <>
            <button
              type="button"
              aria-label="Chiudi pannello"
              className="fixed inset-0 z-40 bg-black/20 md:hidden"
              onClick={closePanel}
            />
            <div className="fixed inset-y-0 right-0 z-50 flex w-[92%] flex-col border-l border-neutral-200 bg-white shadow-xl md:static md:z-auto md:w-[45%] md:shadow-none">
              <CespitiDetailPanel
                mode={panelMode}
                assetId={selectedId}
                isAdmin={isAdmin}
                memberId={memberId}
                onClose={closePanel}
                onSaved={(id) => void handleSaved(id)}
                onOpenMatch={(id) => openEditPanel(id)}
                onDeleted={() => void handleDeleted()}
              />
            </div>
          </>
        ) : null}
      </div>

      {!panelOpen || panelMode === "add" ? (
        <CespitiFab onClick={openAddPanel} />
      ) : null}

      <CespitiFiltersDrawer
        open={filtersOpen}
        filters={filters}
        onChange={setFilters}
        onClose={() => setFiltersOpen(false)}
      />
    </div>
  );
}
