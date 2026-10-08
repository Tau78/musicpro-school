"use client";

import { useEffect, useMemo, useState } from "react";

import {
  formatEuro,
  getRomeDayBoundsUtc,
  listBookingsInRange,
  todayInRome,
  type AdminBookingListItem,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";
import {
  addDaysIso,
  deltaPercent,
  eachDayInclusive,
  formatDayShort,
  previousRange,
  rangeForPreset,
  type DateRange,
  type StatsPreset,
} from "@/lib/admin/stats-period";

type RoomColumnKey = "arancio" | "verde" | "rossa";

type ColumnStat = {
  key: RoomColumnKey | "iscrizioni";
  label: string;
  color: string;
  count: number;
  eur: number;
};

type EnrollmentRow = {
  paid_at: string | null;
  amount_centesimi: number;
  payment_total_centesimi: number | null;
  payment_status: string;
};

const ROOM_COLUMNS: {
  key: RoomColumnKey;
  label: string;
  color: string;
  match: (name: string) => boolean;
}[] = [
  {
    key: "arancio",
    label: "Arancio",
    color: "#D2762A",
    match: (name) => name.toLowerCase().includes("arancio"),
  },
  {
    key: "verde",
    label: "Verde",
    color: "#38764B",
    // ex Blu: aggrega anche «Blu» se ancora in anagrafica
    match: (name) => {
      const lower = name.toLowerCase();
      return lower.includes("verde") || lower.includes("blu");
    },
  },
  {
    key: "rossa",
    label: "Rossa",
    color: "#B23B3E",
    match: (name) => name.toLowerCase().includes("rossa"),
  },
];

const PRESETS: { id: StatsPreset; label: string }[] = [
  { id: "week", label: "Settimana" },
  { id: "month", label: "Mese" },
  { id: "year", label: "Anno" },
  { id: "custom", label: "Da–a" },
];

function bookingDayRome(startAt: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
  }).format(new Date(startAt));
}

function bookingRevenueEur(booking: AdminBookingListItem): number {
  const price = Number(booking.total_price_eur ?? 0);
  if (price > 0) return price;
  const used = Number(booking.credits_used ?? 0);
  if (used > 0) return used;
  return 0;
}

function enrollmentEur(row: EnrollmentRow): number {
  const total = row.payment_total_centesimi ?? row.amount_centesimi;
  return Math.max(0, Number(total) / 100);
}

function chipClass(active: boolean): string {
  return `inline-flex shrink-0 items-center rounded-md px-3 py-1.5 text-xs font-medium touch-manipulation transition-colors ${
    active
      ? "bg-[var(--brand)] text-white shadow-sm"
      : "bg-neutral-100/80 text-neutral-700 hover:bg-neutral-200"
  }`;
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const delta = deltaPercent(current, previous);
  if (delta == null) {
    return (
      <span className="text-[11px] font-medium text-neutral-500">vs prec. —</span>
    );
  }
  const up = delta > 0;
  const flat = delta === 0;
  return (
    <span
      className={`text-[11px] font-semibold ${
        flat
          ? "text-neutral-500"
          : up
            ? "text-emerald-700"
            : "text-red-700"
      }`}
    >
      {flat ? "=" : up ? "▲" : "▼"} {flat ? "0" : `${Math.abs(delta)}`}% vs prec.
    </span>
  );
}

function KpiCard({
  title,
  value,
  previous,
  format,
}: {
  title: string;
  value: number;
  previous: number;
  format: (n: number) => string;
}) {
  return (
    <div className="rounded-xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-black/5">
      <p className="text-xs text-neutral-500">{title}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--brand)]">
        {format(value)}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-[11px] text-neutral-500">
          prec. {format(previous)}
        </span>
        <DeltaBadge current={value} previous={previous} />
      </div>
    </div>
  );
}

function MiniBars({
  days,
  values,
  max,
}: {
  days: string[];
  values: number[];
  max: number;
}) {
  const ceiling = Math.max(1, max);
  return (
    <div className="rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
        Prenotazioni / giorno
      </p>
      <div className="flex h-28 items-end gap-1">
        {days.map((day, index) => {
          const value = values[index] ?? 0;
          const height = Math.round((value / ceiling) * 100);
          return (
            <div
              key={day}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
            >
              <span className="text-[10px] tabular-nums text-neutral-500">
                {value || ""}
              </span>
              <div
                className="w-full max-w-[1.75rem] rounded-t-md bg-[var(--brand)]/85"
                style={{ height: `${Math.max(value > 0 ? 8 : 2, height)}%` }}
                title={`${formatDayShort(day)}: ${value}`}
              />
              <span className="truncate text-[9px] text-neutral-400">
                {formatDayShort(day).split(" ")[0]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompareBars({
  label,
  current,
  previous,
  format,
}: {
  label: string;
  current: number;
  previous: number;
  format: (n: number) => string;
}) {
  const max = Math.max(1, current, previous);
  return (
    <div className="rounded-xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-black/5">
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
        {label}
      </p>
      <div className="space-y-2">
        <BarRow
          label="Periodo"
          value={current}
          max={max}
          format={format}
          tone="bg-[var(--brand)]"
        />
        <BarRow
          label="Precedente"
          value={previous}
          max={max}
          format={format}
          tone="bg-neutral-300"
        />
      </div>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  format,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  format: (n: number) => string;
  tone: string;
}) {
  const width = Math.round((value / max) * 100);
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-neutral-500">{label}</span>
        <span className="font-semibold tabular-nums text-neutral-900">
          {format(value)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${Math.max(value > 0 ? 4 : 0, width)}%` }}
        />
      </div>
    </div>
  );
}

export function AdminStatsDashboard() {
  const supabase = createClient();
  const today = todayInRome();
  const [preset, setPreset] = useState<StatsPreset>("week");
  const [custom, setCustom] = useState<DateRange>({
    from: addDaysIso(today, -6),
    to: today,
  });
  const [bookings, setBookings] = useState<AdminBookingListItem[]>([]);
  const [prevBookings, setPrevBookings] = useState<AdminBookingListItem[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () => rangeForPreset(preset, today, custom),
    [preset, today, custom],
  );
  const prev = useMemo(() => previousRange(range), [range]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const loadEnrollments = async (from: string, toExclusive: string) => {
      const startUtc = getRomeDayBoundsUtc(from).startUtc;
      const endUtc = getRomeDayBoundsUtc(toExclusive).startUtc;
      const { data, error: enrollError } = await supabase
        .from("enrollments")
        .select(
          "paid_at, amount_centesimi, payment_total_centesimi, payment_status",
        )
        .not("paid_at", "is", null)
        .gte("paid_at", startUtc)
        .lt("paid_at", endUtc);
      if (enrollError) throw enrollError;
      return (data ?? []) as EnrollmentRow[];
    };

    void (async () => {
      try {
        const toExclusive = addDaysIso(range.to, 1);
        const prevToExclusive = addDaysIso(prev.to, 1);
        const [currentRows, previousRows, enrollRows] = await Promise.all([
          listBookingsInRange(supabase, {
            from: range.from,
            to: toExclusive,
          }),
          listBookingsInRange(supabase, {
            from: prev.from,
            to: prevToExclusive,
          }),
          loadEnrollments(range.from, toExclusive),
        ]);
        if (cancelled) return;
        setBookings(currentRows);
        setPrevBookings(previousRows);
        setEnrollments(enrollRows);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Impossibile caricare le stats.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, range.from, range.to, prev.from, prev.to]);

  const currentCount = bookings.length;
  const previousCount = prevBookings.length;
  const currentEur = useMemo(
    () => bookings.reduce((sum, row) => sum + bookingRevenueEur(row), 0),
    [bookings],
  );
  const previousEur = useMemo(
    () => prevBookings.reduce((sum, row) => sum + bookingRevenueEur(row), 0),
    [prevBookings],
  );

  const days = useMemo(() => {
    const all = eachDayInclusive(range.from, range.to);
    if (all.length <= 14) return all;
    // mese/anno: campiona ultimi 14 giorni del periodo
    return all.slice(-14);
  }, [range.from, range.to]);

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const booking of bookings) {
      const day = bookingDayRome(booking.start_at);
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    return days.map((day) => map.get(day) ?? 0);
  }, [bookings, days]);

  const columns: ColumnStat[] = useMemo(() => {
    const roomStats = ROOM_COLUMNS.map((col) => {
      let count = 0;
      let eur = 0;
      for (const booking of bookings) {
        const name = booking.room?.name ?? "";
        if (!col.match(name)) continue;
        count += 1;
        eur += bookingRevenueEur(booking);
      }
      return {
        key: col.key,
        label: col.label,
        color: col.color,
        count,
        eur,
      };
    });

    const iscrizioniEur = enrollments.reduce(
      (sum, row) => sum + enrollmentEur(row),
      0,
    );
    return [
      ...roomStats,
      {
        key: "iscrizioni" as const,
        label: "Iscrizioni",
        color: "#1e3a5f",
        count: enrollments.length,
        eur: iscrizioniEur,
      },
    ];
  }, [bookings, enrollments]);

  const periodLabel =
    preset === "week"
      ? "Questa settimana"
      : preset === "month"
        ? "Mese in corso"
        : preset === "year"
          ? "Anno in corso"
          : "Periodo personalizzato";

  return (
    <div className="space-y-3 pb-2">
      <div>
        <h2 className="text-lg font-semibold text-[var(--brand)] sm:text-xl">
          Stats
        </h2>
        <p className="mt-0.5 text-xs text-neutral-600">
          {periodLabel}: {range.from} → {range.to}
        </p>
      </div>

      <div
        className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Periodo"
      >
        {PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={preset === item.id}
            onClick={() => setPreset(item.id)}
            className={chipClass(preset === item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {preset === "custom" ? (
        <div className="flex flex-wrap items-end gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-black/5">
          <label className="text-xs text-neutral-500">
            Da
            <input
              type="date"
              value={custom.from}
              onChange={(e) =>
                setCustom((current) => ({ ...current, from: e.target.value }))
              }
              className="mt-0.5 block rounded-md border border-neutral-200 px-2 py-1.5 text-sm text-neutral-900"
            />
          </label>
          <label className="text-xs text-neutral-500">
            A
            <input
              type="date"
              value={custom.to}
              onChange={(e) =>
                setCustom((current) => ({ ...current, to: e.target.value }))
              }
              className="mt-0.5 block rounded-md border border-neutral-200 px-2 py-1.5 text-sm text-neutral-900"
            />
          </label>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-neutral-500">Caricamento…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <KpiCard
              title="Prenotazioni"
              value={currentCount}
              previous={previousCount}
              format={(n) => String(n)}
            />
            <KpiCard
              title="Incassi sale"
              value={currentEur}
              previous={previousEur}
              format={(n) => formatEuro(n)}
            />
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <MiniBars
              days={days}
              values={byDay}
              max={Math.max(1, ...byDay)}
            />
            <CompareBars
              label="Volume incassi"
              current={currentEur}
              previous={previousEur}
              format={(n) => formatEuro(n)}
            />
          </div>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Per colonna
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              {columns.map((col) => (
                <div
                  key={col.key}
                  className="rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: col.color }}
                    />
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
                      {col.label}
                    </p>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold tabular-nums text-neutral-900">
                    {col.count}
                    <span className="ml-1 text-xs font-medium text-neutral-500">
                      {col.key === "iscrizioni" ? "iscritti" : "prenot."}
                    </span>
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-[var(--brand)]">
                    {formatEuro(col.eur)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
