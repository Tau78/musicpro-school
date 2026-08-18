import type { ReactNode } from "react";

import { CollapsibleSection } from "@/components/admin/collapsible-section";

import type { PaymentVisibility } from "@musicpro/database";

const PAYMENT_VISIBILITY_LABELS: Record<PaymentVisibility, string> = {
  hidden: "Nascosti",
  status: "Solo stato",
  amounts: "Importi visibili",
};

export type TeacherProfileReadonlyProps = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  subjectNames: string[];
  canCreateCourses: boolean;
  canReschedule: boolean;
  canCloseCourses: boolean;
  paymentVisibility: PaymentVisibility;
  children?: ReactNode;
};

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function yesNo(value: boolean): string {
  return value ? "Sì" : "No";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  );
}

export function TeacherProfileReadonly({
  firstName,
  lastName,
  email,
  phone,
  subjectNames,
  canCreateCourses,
  canReschedule,
  canCloseCourses,
  paymentVisibility,
  children,
}: TeacherProfileReadonlyProps) {
  const fullName = `${firstName} ${lastName}`.trim();
  const subjectsLabel =
    subjectNames.length > 0 ? subjectNames.join(", ") : "Nessuna materia assegnata.";

  return (
    <div className="space-y-8">
      <CollapsibleSection title="Anagrafica" defaultOpen>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Nome" value={displayValue(fullName)} />
          <Row label="Email" value={displayValue(email)} />
          <Row label="Telefono" value={displayValue(phone)} />
          <Row label="Materie insegnate" value={subjectsLabel} />
        </dl>
      </CollapsibleSection>

      {children}

      <CollapsibleSection title="Permessi">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Puoi creare corsi" value={yesNo(canCreateCourses)} />
          <Row label="Puoi spostare lezioni" value={yesNo(canReschedule)} />
          <Row label="Puoi chiudere corsi" value={yesNo(canCloseCourses)} />
          <Row
            label="Visibilità pagamenti"
            value={PAYMENT_VISIBILITY_LABELS[paymentVisibility]}
          />
        </dl>
      </CollapsibleSection>
    </div>
  );
}
