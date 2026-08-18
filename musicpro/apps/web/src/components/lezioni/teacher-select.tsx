"use client";

import { useRouter } from "next/navigation";

export function TeacherSelect({
  teachers,
  selectedId,
}: {
  teachers: { id: string; label: string }[];
  selectedId: string;
}) {
  const router = useRouter();

  return (
    <label className="block max-w-sm text-sm">
      <span className="mb-1 block text-neutral-600">Docente</span>
      <select
        value={selectedId}
        onChange={(e) => {
          const id = e.target.value;
          router.push(
            id
              ? `/admin/lezioni/disponibilita?docente=${encodeURIComponent(id)}`
              : "/admin/lezioni/disponibilita",
          );
        }}
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
      >
        {teachers.map((teacher) => (
          <option key={teacher.id} value={teacher.id}>
            {teacher.label}
          </option>
        ))}
      </select>
    </label>
  );
}
