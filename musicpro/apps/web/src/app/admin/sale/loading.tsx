export default function SaleLoading() {
  return (
    <div className="min-w-0 animate-pulse space-y-4">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-9 w-20 rounded-lg bg-neutral-200"
          />
        ))}
      </div>
      <div className="h-10 w-48 rounded-lg bg-neutral-200" />
      <div className="space-y-3 pt-2">
        <div className="h-12 rounded-lg bg-neutral-100" />
        <div className="h-12 rounded-lg bg-neutral-100" />
        <div className="h-32 rounded-lg bg-neutral-100" />
      </div>
    </div>
  );
}
