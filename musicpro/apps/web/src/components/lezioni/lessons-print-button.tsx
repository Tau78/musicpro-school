"use client";

/**
 * @media print nasconde header/nav (`[data-app-nav]`, `header`, `nav`)
 * e gli elementi `.print:hidden` (questo bottone).
 */
export function LessonsPrintButton({
  label = "Stampa",
}: {
  label?: string;
}) {
  return (
    <>
      <style>{`
        @media print {
          header, nav, [data-app-nav], .print\\:hidden { display: none !important; }
        }
      `}</style>
      <button
        type="button"
        onClick={() => window.print()}
        className="print:hidden touch-manipulation rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
      >
        {label}
      </button>
    </>
  );
}
