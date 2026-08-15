import Link from "next/link";

import { APP_NAME } from "@musicpro/shared";

type BrandLogoProps = {
  href?: string;
  size?: "sm" | "md" | "lg";
  showSubtitle?: boolean;
};

const sizes = {
  sm: { icon: 32, title: "text-base", sub: "text-xs" },
  md: { icon: 40, title: "text-lg", sub: "text-xs" },
  lg: { icon: 48, title: "text-xl", sub: "text-sm" },
};

function LogoMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="shrink-0"
    >
      <rect width="48" height="48" rx="12" fill="#1e3a5f" />
      <path
        d="M14 32V16l8 9.5L30 16v16"
        stroke="#c9a227"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="36" cy="14" r="3" fill="#c9a227" />
    </svg>
  );
}

export function BrandLogo({
  href = "/prenotazioni",
  size = "md",
  showSubtitle = true,
}: BrandLogoProps) {
  const s = sizes[size];

  const content = (
    <div className="flex items-center gap-3">
      <LogoMark size={s.icon} />
      <div className="min-w-0">
        <p className={`font-semibold leading-tight text-[var(--brand)] ${s.title}`}>
          {APP_NAME}
        </p>
        {showSubtitle ? (
          <p className={`text-neutral-500 ${s.sub}`}>Associazione MusicPro</p>
        ) : null}
      </div>
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <Link href={href} className="inline-flex rounded-lg outline-offset-4 hover:opacity-90">
      {content}
    </Link>
  );
}
