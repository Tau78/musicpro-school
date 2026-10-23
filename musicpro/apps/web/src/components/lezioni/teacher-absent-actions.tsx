"use client";

import { useState } from "react";

import {
  TeacherAbsenceDialog,
  teacherAbsenceButtonClass,
} from "@/components/lezioni/teacher-absence-dialog";

export interface TeacherAbsentActionsProps {
  actorMemberId: string;
  isStaff: boolean;
  teacherId?: string;
  teachers?: { id: string; label: string }[];
}

export function TeacherAbsenceOpenButton(props: TeacherAbsentActionsProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={teacherAbsenceButtonClass}
      >
        Sarò assente
      </button>
      <TeacherAbsenceDialog
        open={open}
        onClose={() => setOpen(false)}
        {...props}
      />
    </>
  );
}

export function TeacherAbsentActions(props: TeacherAbsentActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="glass-card flex min-w-0 max-w-full flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--brand)]">
          Sarò assente
        </h3>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={teacherAbsenceButtonClass}
        >
          Sarò assente
        </button>
      </div>
      <TeacherAbsenceDialog
        open={open}
        onClose={() => setOpen(false)}
        {...props}
      />
    </>
  );
}
