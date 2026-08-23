"use client";

import { listAllRooms } from "@musicpro/database";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { AdminFlatNav } from "@/components/admin/admin-side-nav";
import { parseRoomTab, roomSettingsHref } from "@/lib/admin/room-tabs";
import { isSettingsPath } from "@/lib/admin/settings-nav";
import { createClient } from "@/lib/supabase/client";

interface SettingsSubNavProps {
  showQuote: boolean;
  showSale: boolean;
  showShop: boolean;
  showPrenotazioniSettings: boolean;
  showDocumenti: boolean;
  children: ReactNode;
}

type RoomNavItem = {
  id: string;
  name: string;
  is_active: boolean;
};

export function SettingsSubNav({
  showQuote,
  showSale,
  showShop,
  showPrenotazioniSettings,
  showDocumenti,
  children,
}: SettingsSubNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rooms, setRooms] = useState<RoomNavItem[]>([]);

  const onSale = pathname.startsWith("/admin/sale");
  const activeRoomId = onSale
    ? (pathname.match(/^\/admin\/sale\/([^/?]+)/)?.[1] ?? null)
    : null;
  const activeTab = parseRoomTab(searchParams.get("tab") ?? undefined);

  useEffect(() => {
    if (!showSale || !isSettingsPath(pathname)) {
      setRooms([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      const supabase = createClient();
      const data = await listAllRooms(supabase);
      if (cancelled) return;

      setRooms(
        data.map((room) => ({
          id: room.id,
          name: room.name,
          is_active: room.is_active,
        })),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [showSale, pathname]);

  if (!isSettingsPath(pathname)) {
    return children;
  }

  const onQuote = pathname.startsWith("/admin/quote");
  const onImpostazioniRoot =
    pathname === "/admin/impostazioni" || pathname.startsWith("/admin/penali");

  const items: {
    href: string;
    label: string;
    active: boolean;
    visible: boolean;
  }[] = [
    {
      href: "/admin/quote",
      label: "Quote",
      active: onQuote,
      visible: showQuote,
    },
    ...rooms.map((room) => ({
      href: roomSettingsHref(room.id, activeTab),
      label: room.is_active ? room.name : `${room.name} · chiusa`,
      active: room.id === activeRoomId,
      visible: showSale,
    })),
    {
      href: "/admin/shop",
      label: "Shop",
      active: pathname.startsWith("/admin/shop"),
      visible: showShop,
    },
    {
      href: "/admin/impostazioni",
      label: "Prenotazioni",
      active: onImpostazioniRoot,
      visible: showPrenotazioniSettings,
    },
    {
      href: "/admin/impostazioni/documenti",
      label: "Documenti",
      active: pathname === "/admin/impostazioni/documenti",
      visible: showDocumenti,
    },
    {
      href: "/admin/impostazioni/documenti/drive",
      label: "Cartelle",
      active: pathname.startsWith("/admin/impostazioni/documenti/drive"),
      visible: showDocumenti,
    },
    {
      href: "/admin/impostazioni/documenti/template",
      label: "Modelli",
      active:
        pathname.startsWith("/admin/impostazioni/documenti/template") ||
        pathname.startsWith("/admin/template"),
      visible: showDocumenti,
    },
  ].filter((item) => item.visible);

  if (items.length === 0) {
    return children;
  }

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <AdminFlatNav
        items={items.map(({ href, label, active }) => ({ href, label, active }))}
        label="Impostazioni"
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
