import { redirect } from "next/navigation";

export default function AdminRicevuteRedirectPage() {
  redirect("/admin/documenti/ricevute");
}
