import { DocumentiSubNav } from "@/components/admin/documenti-sub-nav";

export default function DocumentiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Documenti
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Storage, cartelle Drive e modelli per documenti e messaggi.
        </p>
      </div>
      <DocumentiSubNav />
      {children}
    </div>
  );
}
