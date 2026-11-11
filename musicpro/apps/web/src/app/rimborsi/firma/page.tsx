import { ReimbursementSignClient } from "@/components/reimbursements/reimbursement-sign-client";

export default async function ReimbursementSignPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="min-w-0 max-w-full overflow-x-clip bg-neutral-50 px-4 py-8 sm:px-6">
      <div className="mx-auto min-w-0 max-w-3xl">
        <ReimbursementSignClient token={String(token || "").trim()} />
      </div>
    </main>
  );
}
