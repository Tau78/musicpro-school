"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  columnTrack,
  formatRomeDayTitle,
  formatRomeTime,
  rowsForScreen,
  sliceBoardPages,
  type BoardLayout,
  type PublicOccupancyView,
  type PublicTimetableView,
} from "@musicpro/database";

type Theme = {
  page: string;
  font: string;
  header: string;
  title: string;
  clock: string;
  columns: string;
  row: string;
  alt: string;
  now: string;
  past: string;
  card: string;
  free: string;
  busy: string;
};

function theme(layout: BoardLayout): Theme {
  switch (layout) {
    case "giorno":
      return {
        page: "bg-[#071433] text-white",
        font: "font-sans",
        header: "bg-[#f5c400] text-black",
        title: "text-black",
        clock: "text-black",
        columns: "text-white/70",
        row: "bg-[#1d4ed8] text-white",
        alt: "bg-[#1e3a8a] text-white",
        now: "bg-white text-[#0b1f4a]",
        past: "bg-[#1e3a8a]/50 text-white/35",
        card: "border border-white/15 bg-[#12306e]",
        free: "text-emerald-300",
        busy: "text-[#f5c400]",
      };
    case "viola":
      return {
        page: "bg-[#16081f] text-white",
        font: "font-sans",
        header: "bg-[#6d28d9] text-white",
        title: "text-white",
        clock: "text-fuchsia-100",
        columns: "text-fuchsia-200/70",
        row: "bg-[#3b0764] text-white",
        alt: "bg-[#4c1d95] text-white",
        now: "bg-fuchsia-200 text-[#2e1065]",
        past: "bg-[#3b0764]/40 text-white/30",
        card: "border border-fuchsia-400/20 bg-[#2e1065]",
        free: "text-emerald-300",
        busy: "text-fuchsia-200",
      };
    case "notte":
      return {
        page: "bg-[#05070d] text-emerald-50",
        font: "font-mono",
        header: "border-b border-emerald-500/30",
        title: "text-emerald-400",
        clock: "text-emerald-300",
        columns: "text-emerald-500/80",
        row: "text-emerald-50",
        alt: "bg-emerald-400/[0.04] text-emerald-50",
        now: "bg-emerald-400 text-black",
        past: "text-emerald-100/25",
        card: "border border-emerald-500/25 bg-black",
        free: "text-emerald-400",
        busy: "text-emerald-200",
      };
    case "aeroporto":
      return {
        page: "bg-black text-amber-50",
        font: "font-mono",
        header: "border-b border-amber-500/40",
        title: "text-amber-400",
        clock: "text-amber-300",
        columns: "text-amber-500/80",
        row: "text-amber-50",
        alt: "bg-white/[0.04] text-amber-50",
        now: "bg-amber-400 text-black",
        past: "text-amber-100/25",
        card: "border border-amber-500/25 bg-zinc-950",
        free: "text-emerald-400",
        busy: "text-amber-300",
      };
  }
}

function useClock(refresh: () => void) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const reload = window.setInterval(refresh, 30_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(reload);
    };
  }, [refresh]);
  return now;
}

function Header({
  name,
  siteLabel,
  hideBrand,
  layout,
  now,
}: {
  name: string;
  siteLabel: string;
  hideBrand: boolean;
  layout: BoardLayout;
  now: number;
}) {
  const colors = theme(layout);
  const banner = layout === "giorno" || layout === "viola";
  return (
    <header
      className={`flex items-center justify-between gap-4 px-4 py-3 ${colors.header}`}
    >
      <div className="min-w-0">
        <p
          className={`truncate font-semibold tracking-[0.18em] ${colors.title} ${banner ? "text-2xl" : "text-sm"}`}
        >
          {banner ? formatRomeDayTitle(new Date(now)) : name.toLocaleUpperCase("it-IT")}
        </p>
        {!hideBrand && (banner || siteLabel !== name) ? (
          <p className={`truncate text-xs tracking-wide ${colors.clock}`}>{siteLabel}</p>
        ) : null}
      </div>
      <p className={`shrink-0 font-mono text-3xl tabular-nums ${colors.clock}`}>
        {formatRomeTime(new Date(now).toISOString())}
      </p>
    </header>
  );
}

export function TvBoard({ view }: { view: PublicTimetableView }) {
  const router = useRouter();
  const now = useClock(() => router.refresh());
  const [page, setPage] = useState(0);
  const colors = theme(view.layout);
  const live = rowsForScreen(view.rows, now, view.rowCount);
  const pages = sliceBoardPages(live, view.rowCount);
  const current = pages[page % pages.length] ?? [];

  useEffect(() => {
    if (pages.length < 2) return;
    const timer = window.setInterval(() => setPage((value) => value + 1), 12_000);
    return () => window.clearInterval(timer);
  }, [pages.length]);

  const tracks = view.columns.map((column) => columnTrack(column.key)).join(" ");
  const rowHeight = `min(${view.rowHeightPx}px, calc((100dvh - 6.5rem) / ${view.rowCount}))`;
  const blanks = Math.max(0, view.rowCount - current.length);

  return (
    <div className={`flex h-dvh flex-col overflow-hidden ${colors.page} ${colors.font}`}>
      <Header
        name={view.name}
        siteLabel={view.siteLabel}
        hideBrand={view.hideBrand}
        layout={view.layout}
        now={now}
      />
      <div
        className={`grid px-4 py-2 text-[11px] uppercase tracking-[0.22em] ${colors.columns}`}
        style={{ gridTemplateColumns: tracks }}
      >
        {view.columns.map((column, index) => (
          <span key={`${column.key}-${index}`} className="truncate pr-3">
            {column.boardLabel}
          </span>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {current.length === 0 && blanks === view.rowCount ? (
          <p className={`px-4 pt-8 text-lg ${colors.columns}`}>Nessuna lezione oggi.</p>
        ) : (
          [...current, ...Array.from({ length: blanks }, (_, index) => index)].map(
            (row, index) => {
              if (typeof row === "number") {
                return (
                  <div
                    key={`blank-${row}`}
                    style={{ height: rowHeight }}
                    className={index % 2 === 1 ? colors.alt : ""}
                  />
                );
              }
              const start = Date.parse(row.startsAt);
              const end = Date.parse(row.endsAt);
              const state = now >= end ? "past" : now >= start ? "now" : "next";
              const tone =
                state === "now" ? colors.now : state === "past" ? colors.past : index % 2 === 1 ? colors.alt : colors.row;
              return (
                <div
                  key={row.id}
                  className={`grid items-center px-4 ${tone}`}
                  style={{
                    height: rowHeight,
                    gridTemplateColumns: tracks,
                    fontSize: `calc(${rowHeight} * 0.38)`,
                  }}
                >
                  {row.cells.map((cell, cellIndex) => (
                    <span key={cellIndex} className="truncate pr-3">
                      {cell}
                    </span>
                  ))}
                </div>
              );
            },
          )
        )}
      </div>
    </div>
  );
}

export function TvOccupancy({ view }: { view: PublicOccupancyView }) {
  const router = useRouter();
  const now = useClock(() => router.refresh());
  const colors = theme(view.layout);

  return (
    <div className={`flex h-dvh flex-col overflow-hidden ${colors.page} ${colors.font}`}>
      <Header
        name={view.name}
        siteLabel={view.siteLabel}
        hideBrand={view.hideBrand}
        layout={view.layout}
        now={now}
      />
      {view.rooms.length === 0 ? (
        <p className={`px-4 pt-8 text-lg ${colors.columns}`}>Nessuna aula.</p>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-3 p-4">
          {view.rooms.map((room) => (
            <article
              key={room.roomId}
              className={`flex min-h-0 flex-col justify-between p-4 ${colors.card}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="truncate text-xl font-semibold">{room.roomName}</h2>
                <span
                  className={`text-xs tracking-[0.2em] ${room.state === "occupata" ? colors.busy : colors.free}`}
                >
                  {room.state === "occupata" ? "OCCUPATA" : "LIBERA"}
                </span>
              </div>
              <div>
                <p className="truncate text-2xl">{room.nowLabel}</p>
                <p className={`text-sm ${colors.columns}`}>{room.nowTime}</p>
              </div>
              <p className={`truncate text-sm ${colors.columns}`}>
                {room.nextLabel
                  ? `Poi ${room.nextTime} ${room.nextLabel}`
                  : "Nessun turno dopo"}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function BoardOff({ unavailable = false }: { unavailable?: boolean }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-black px-6 text-center text-amber-100">
      <p className="text-lg tracking-wide">
        {unavailable
          ? "Tabellone non disponibile."
          : "Il tabellone pubblico è spento."}
      </p>
    </div>
  );
}
