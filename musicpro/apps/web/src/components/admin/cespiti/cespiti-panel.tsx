"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { FixedAsset } from "@musicpro/database";

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
import {
  CespitiTable,
  type CespitiColumnSort,
} from "./cespiti-table";

export type CespitiSortMode = "sala" | "name" | "date";

interface CespitiPanelProps {
  initialAssets: CespitiAssetWithPhoto[];
  isAdmin: boolean;
  memberId: string;
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

function sortAssetsByMode(
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

  return copy;
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
  const [columnSort, setColumnSort] = useState<CespitiColumnSort | null>(null);
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

  const tableAssets = useMemo(() => {
    if (columnSort) return assets;
    if (sortMode === "sala") return assets;
    return sortAssetsByMode(assets, sortMode);
  }, [assets, sortMode, columnSort]);

  const groupBySala = sortMode === "sala" && columnSort?.key !== "location";

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
            <span className="sr-only">Vista</span>
            <select
              value={sortMode}
              onChange={(event) => {
                setSortMode(event.target.value as CespitiSortMode);
                setColumnSort(null);
              }}
              className="min-h-[44px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            >
              <option value="sala">Raggruppa per sala</option>
              <option value="name">Lista per nome</option>
              <option value="date">Lista per data</option>
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
          className={`min-w-0 overflow-x-auto overflow-y-auto ${
            panelOpen
              ? "hidden md:block md:w-[55%] md:border-r md:border-neutral-100"
              : "w-full"
          }`}
        >
          {loading ? (
            <p className="px-4 py-6 text-sm text-neutral-500">Caricamento…</p>
          ) : tableAssets.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-neutral-500">
              Nessun cespite trovato.
            </p>
          ) : (
            <CespitiTable
              assets={tableAssets}
              groupBySala={groupBySala}
              selectedId={selectedId}
              panelOpen={panelOpen}
              onSelect={openEditPanel}
              columnSort={columnSort}
              onColumnSortChange={setColumnSort}
            />
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
