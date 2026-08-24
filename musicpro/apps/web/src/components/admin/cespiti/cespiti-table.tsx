"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  LOCATION_PRESETS,
  LOCATION_PRESET_LABELS,
  type FixedAsset,
  type LocationPreset,
} from "@musicpro/database";

import { locationShortLabel } from "./cespiti-location-picker";
import type { CespitiAssetWithPhoto } from "./cespiti-detail-panel";

export type CespitiColumnKey =
  | "name"
  | "brandModel"
  | "quantity"
  | "serial"
  | "location"
  | "status";

export type CespitiColumnSort = {
  key: CespitiColumnKey;
  direction: "asc" | "desc";
};

const STORAGE_KEY = "cespiti-table-column-widths-v1";

const DEFAULT_WIDTHS: Record<string, number> = {
  photo: 52,
  name: 200,
  brandModel: 180,
  quantity: 52,
  serial: 130,
  location: 110,
  status: 80,
};

const MIN_WIDTHS: Record<string, number> = {
  photo: 44,
  name: 100,
  brandModel: 90,
  quantity: 44,
  serial: 70,
  location: 80,
  status: 64,
};

function loadWidths(): Record<string, number> {
  if (typeof window === "undefined") return { ...DEFAULT_WIDTHS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WIDTHS };
    return { ...DEFAULT_WIDTHS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_WIDTHS };
  }
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

function compareAssets(
  a: CespitiAssetWithPhoto,
  b: CespitiAssetWithPhoto,
  key: CespitiColumnKey,
): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name, "it", { sensitivity: "base" });
    case "brandModel": {
      const av = [a.brand, a.model].filter(Boolean).join(" ");
      const bv = [b.brand, b.model].filter(Boolean).join(" ");
      return av.localeCompare(bv, "it", { sensitivity: "base" });
    }
    case "quantity":
      return a.quantity - b.quantity;
    case "serial": {
      const av = a.serial ?? "";
      const bv = b.serial ?? "";
      return av.localeCompare(bv, "it", { sensitivity: "base" });
    }
    case "location": {
      const ar = a.locationPreset
        ? LOCATION_PRESETS.indexOf(a.locationPreset)
        : LOCATION_PRESETS.length;
      const br = b.locationPreset
        ? LOCATION_PRESETS.indexOf(b.locationPreset)
        : LOCATION_PRESETS.length;
      if (ar !== br) return ar - br;
      return (a.locationCustom ?? "").localeCompare(
        b.locationCustom ?? "",
        "it",
        { sensitivity: "base" },
      );
    }
    case "status": {
      const rank = (asset: FixedAsset) => {
        if (asset.deletedAt) return 2;
        if (asset.disposedAt) return 1;
        return 0;
      };
      return rank(a) - rank(b);
    }
    default:
      return 0;
  }
}

function sortByColumn(
  assets: CespitiAssetWithPhoto[],
  sort: CespitiColumnSort,
): CespitiAssetWithPhoto[] {
  const copy = [...assets];
  copy.sort((a, b) => {
    const cmp = compareAssets(a, b, sort.key);
    return sort.direction === "asc" ? cmp : -cmp;
  });
  return copy;
}

function groupByLocation(
  assets: CespitiAssetWithPhoto[],
  innerSort: CespitiColumnSort | null,
): { key: string; label: string; items: CespitiAssetWithPhoto[] }[] {
  const groups = new Map<string, CespitiAssetWithPhoto[]>();

  for (const asset of assets) {
    const key = asset.locationPreset ?? "__none__";
    const current = groups.get(key) ?? [];
    current.push(asset);
    groups.set(key, current);
  }

  const orderedKeys = [...LOCATION_PRESETS, "__none__"].filter((key) =>
    groups.has(key),
  );

  return orderedKeys.map((key) => {
    let items = groups.get(key) ?? [];
    if (innerSort) {
      items = sortByColumn(items, innerSort);
    } else {
      items = [...items].sort((a, b) =>
        a.name.localeCompare(b.name, "it", { sensitivity: "base" }),
      );
    }
    return {
      key,
      label:
        key === "__none__"
          ? "Senza sala"
          : LOCATION_PRESET_LABELS[key as LocationPreset],
      items,
    };
  });
}

const COLUMNS: {
  id: string;
  label: string;
  sortKey?: CespitiColumnKey;
  className?: string;
}[] = [
  { id: "photo", label: "" },
  { id: "name", label: "Nome", sortKey: "name" },
  { id: "brandModel", label: "Marca / modello", sortKey: "brandModel" },
  { id: "quantity", label: "N°", sortKey: "quantity", className: "text-center" },
  { id: "serial", label: "Seriale", sortKey: "serial" },
  { id: "location", label: "Sala", sortKey: "location" },
  { id: "status", label: "Stato", sortKey: "status" },
];

interface CespitiTableProps {
  assets: CespitiAssetWithPhoto[];
  groupBySala: boolean;
  selectedId: string | null;
  panelOpen: boolean;
  onSelect: (id: string) => void;
  columnSort: CespitiColumnSort | null;
  onColumnSortChange: (sort: CespitiColumnSort | null) => void;
}

export function CespitiTable({
  assets,
  groupBySala,
  selectedId,
  panelOpen,
  onSelect,
  columnSort,
  onColumnSortChange,
}: CespitiTableProps) {
  const [widths, setWidths] = useState<Record<string, number>>(loadWidths);
  const resizeRef = useRef<{
    colId: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  }, [widths]);

  const handleResizeStart = useCallback(
    (colId: string, clientX: number) => {
      resizeRef.current = {
        colId,
        startX: clientX,
        startWidth: widths[colId] ?? DEFAULT_WIDTHS[colId] ?? 100,
      };
    },
    [widths],
  );

  useEffect(() => {
    function onMove(event: MouseEvent) {
      const state = resizeRef.current;
      if (!state) return;
      const min = MIN_WIDTHS[state.colId] ?? 48;
      const next = Math.max(
        min,
        state.startWidth + event.clientX - state.startX,
      );
      setWidths((current) => ({ ...current, [state.colId]: next }));
    }

    function onUp() {
      resizeRef.current = null;
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  function handleHeaderClick(sortKey: CespitiColumnKey) {
    if (!columnSort || columnSort.key !== sortKey) {
      onColumnSortChange({ key: sortKey, direction: "asc" });
      return;
    }
    if (columnSort.direction === "asc") {
      onColumnSortChange({ key: sortKey, direction: "desc" });
      return;
    }
    onColumnSortChange(null);
  }

  function sortIndicator(key: CespitiColumnKey): string {
    if (!columnSort || columnSort.key !== key) return "";
    return columnSort.direction === "asc" ? " ↑" : " ↓";
  }

  const showLocationColumn = !groupBySala;

  const visibleColumns = COLUMNS.filter(
    (col) => col.id !== "location" || showLocationColumn,
  );

  const processedGroups = useMemo(() => {
    if (groupBySala && !columnSort) {
      return groupByLocation(assets, null);
    }
    if (groupBySala && columnSort) {
      return groupByLocation(assets, columnSort);
    }
    const sorted = columnSort ? sortByColumn(assets, columnSort) : assets;
    return [{ key: "all", label: "", items: sorted }];
  }, [assets, groupBySala, columnSort]);

  const totalWidth = visibleColumns.reduce(
    (sum, col) => sum + (widths[col.id] ?? DEFAULT_WIDTHS[col.id] ?? 80),
    0,
  );

  return (
    <table
      className="w-full text-sm"
      style={{ tableLayout: "fixed", minWidth: totalWidth }}
    >
      <colgroup>
        {visibleColumns.map((col) => (
          <col
            key={col.id}
            style={{ width: widths[col.id] ?? DEFAULT_WIDTHS[col.id] }}
          />
        ))}
      </colgroup>

      <thead className="sticky top-0 z-20 border-b border-neutral-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.05)]">
        <tr>
          {visibleColumns.map((col, index) => (
            <th
              key={col.id}
              scope="col"
              className={`relative select-none px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500 ${col.className ?? ""}`}
            >
              {col.sortKey ? (
                <button
                  type="button"
                  onClick={() => handleHeaderClick(col.sortKey!)}
                  className="inline-flex max-w-full items-center gap-0.5 truncate touch-manipulation hover:text-[var(--brand)]"
                  title={`Ordina per ${col.label}`}
                >
                  {col.label}
                  <span className="text-[var(--brand)]">{sortIndicator(col.sortKey)}</span>
                </button>
              ) : (
                col.label
              )}
              {index < visibleColumns.length - 1 ? (
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Ridimensiona colonna ${col.label || "foto"}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleResizeStart(col.id, event.clientX);
                  }}
                  className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none hover:bg-[var(--brand)]/20"
                />
              ) : null}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {processedGroups.map((group) => (
          <Fragment key={group.key}>
            {group.label ? (
              <tr className="bg-neutral-50">
                <td
                  colSpan={visibleColumns.length}
                  className="sticky top-[37px] z-10 border-y border-neutral-100 px-3 py-1.5"
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
                    {group.label}
                  </span>
                </td>
              </tr>
            ) : null}

            {group.items.map((asset) => {
              const status = assetStatus(asset);
              const selected = selectedId === asset.id && panelOpen;
              const brandModel =
                [asset.brand, asset.model].filter(Boolean).join(" ") || "—";

              return (
                <tr
                  key={asset.id}
                  onClick={() => onSelect(asset.id)}
                  className={`cursor-pointer border-b border-neutral-100 touch-manipulation hover:bg-neutral-50 ${
                    selected ? "bg-[var(--brand)]/5" : ""
                  }`}
                >
                  {visibleColumns.map((col) => {
                    if (col.id === "photo") {
                      return (
                        <td key={col.id} className="px-2 py-1.5 align-middle">
                          <div className="mx-auto flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-neutral-50">
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
                      );
                    }

                    if (col.id === "name") {
                      return (
                        <td
                          key={col.id}
                          className="px-2 py-1.5 align-middle"
                          title={asset.name}
                        >
                          <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-medium text-neutral-900">
                            {asset.name}
                          </span>
                        </td>
                      );
                    }

                    if (col.id === "brandModel") {
                      return (
                        <td
                          key={col.id}
                          className="px-2 py-1.5 align-middle"
                          title={brandModel}
                        >
                          <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-neutral-600">
                            {brandModel}
                          </span>
                        </td>
                      );
                    }

                    if (col.id === "quantity") {
                      return (
                        <td
                          key={col.id}
                          className="px-1 py-1.5 text-center align-middle tabular-nums text-neutral-800"
                        >
                          {asset.quantity}
                        </td>
                      );
                    }

                    if (col.id === "serial") {
                      return (
                        <td
                          key={col.id}
                          className="px-2 py-1.5 align-middle"
                          title={asset.serial ?? undefined}
                        >
                          <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-neutral-600">
                            {asset.serial ?? "—"}
                          </span>
                        </td>
                      );
                    }

                    if (col.id === "location") {
                      const loc = locationShortLabel(
                        asset.locationPreset,
                        asset.locationCustom,
                      );
                      return (
                        <td
                          key={col.id}
                          className="px-2 py-1.5 align-middle"
                          title={loc}
                        >
                          <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-neutral-600">
                            {loc}
                          </span>
                        </td>
                      );
                    }

                    if (col.id === "status") {
                      return (
                        <td key={col.id} className="px-2 py-1.5 align-middle">
                          <span
                            className={`inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}
                          >
                            {status.label}
                          </span>
                        </td>
                      );
                    }

                    return null;
                  })}
                </tr>
              );
            })}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
