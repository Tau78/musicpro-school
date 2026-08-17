import Link from "next/link";

export interface AdminPillNavItem {
  href: string;
  label: string;
  active: boolean;
}

export function AdminPillNav({
  items,
  nested = false,
}: {
  items: AdminPillNavItem[];
  nested?: boolean;
}) {
  return (
    <nav
      className={`mb-8 flex flex-wrap gap-2 text-sm ${
        nested
          ? "border-b border-neutral-100 pb-2"
          : "border-b border-neutral-200 pb-3"
      }`}
    >
      {items.map((item) =>
        item.active ? (
          <span
            key={item.href}
            className={
              nested
                ? "rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white"
                : "rounded-lg bg-[var(--brand)] px-3 py-1.5 font-medium text-white"
            }
          >
            {item.label}
          </span>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className={
              nested
                ? "rounded-md px-2.5 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                : "rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            }
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
