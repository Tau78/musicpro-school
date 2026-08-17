import { redirect } from "next/navigation";

export default function PenaliRedirectPage() {
  redirect("/admin/impostazioni?sezione=penali");
}
