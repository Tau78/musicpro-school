"use client";

interface CespitiFabProps {
  onClick: () => void;
  label?: string;
}

export function CespitiFab({ onClick, label = "Nuovo cespite" }: CespitiFabProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand)] text-2xl font-light text-white shadow-lg touch-manipulation hover:opacity-95 md:bottom-6"
    >
      +
    </button>
  );
}
