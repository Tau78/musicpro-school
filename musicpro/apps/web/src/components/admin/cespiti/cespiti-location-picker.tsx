"use client";

import {
  LOCATION_PRESETS,
  LOCATION_PRESET_LABELS,
  type LocationPreset,
} from "@musicpro/database";

const LOCATION_TILE_STYLES: Record<LocationPreset, string> = {
  sala_arancio: "bg-orange-100 border-orange-400 text-orange-950 ring-orange-300",
  sala_blu: "bg-sky-100 border-sky-400 text-sky-950 ring-sky-300",
  sala_verde: "bg-emerald-100 border-emerald-400 text-emerald-950 ring-emerald-300",
  sala_rossa: "bg-rose-100 border-rose-400 text-rose-950 ring-rose-300",
  ingresso: "bg-neutral-100 border-neutral-400 text-neutral-900 ring-neutral-300",
  magazzino: "bg-stone-100 border-stone-400 text-stone-900 ring-stone-300",
  box: "bg-amber-100 border-amber-400 text-amber-950 ring-amber-300",
  altro: "bg-violet-100 border-violet-400 text-violet-950 ring-violet-300",
};

interface CespitiLocationPickerProps {
  value: LocationPreset | null;
  customValue: string;
  onChange: (preset: LocationPreset | null, custom: string) => void;
}

export function CespitiLocationPicker({
  value,
  customValue,
  onChange,
}: CespitiLocationPickerProps) {
  const tiles = LOCATION_PRESETS.filter((preset) => preset !== "altro");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((preset) => {
          const selected = value === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset, "")}
              className={`min-h-[44px] rounded-lg border px-2 py-2 text-xs font-medium touch-manipulation transition-all ${
                LOCATION_TILE_STYLES[preset]
              } ${selected ? "ring-2" : "opacity-80 hover:opacity-100"}`}
            >
              {LOCATION_PRESET_LABELS[preset]}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange("altro", customValue)}
          className={`min-h-[44px] rounded-lg border px-2 py-2 text-xs font-medium touch-manipulation transition-all ${
            LOCATION_TILE_STYLES.altro
          } ${value === "altro" ? "ring-2" : "opacity-80 hover:opacity-100"}`}
        >
          Altro
        </button>
      </div>

      {value === "altro" ? (
        <label className="block">
          <span className="text-xs font-medium text-neutral-600">
            Dettaglio ubicazione
          </span>
          <input
            type="text"
            value={customValue}
            onChange={(event) => onChange("altro", event.target.value)}
            placeholder="Es. ripiano A, scaffale 3…"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
          />
        </label>
      ) : null}
    </div>
  );
}

export function locationShortLabel(
  preset: LocationPreset | null,
  custom: string | null,
): string {
  if (preset) {
    const base = LOCATION_PRESET_LABELS[preset];
    if (preset === "altro" && custom?.trim()) return custom.trim();
    return base;
  }
  return custom?.trim() || "—";
}
