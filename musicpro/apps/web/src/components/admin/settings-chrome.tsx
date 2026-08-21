"use client";

export function SettingsTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist">
      {tabs.map((tab) => (
        <SettingsTabButton
          key={tab.id}
          label={tab.label}
          selected={value === tab.id}
          onClick={() => onChange(tab.id)}
        />
      ))}
    </div>
  );
}

export function SettingsSideNav<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label?: string;
}) {
  return (
    <nav className="md:w-36 md:shrink-0" aria-label={label}>
      <ul className="flex flex-wrap gap-1.5 md:flex-col md:flex-nowrap">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <SettingsTabButton
              label={tab.label}
              selected={value === tab.id}
              onClick={() => onChange(tab.id)}
              block
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SettingsTabButton({
  label,
  selected,
  onClick,
  block = false,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  block?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`${block ? "w-full text-left" : ""} rounded-lg px-3 py-1.5 text-sm font-medium ${
        selected
          ? "bg-[var(--brand)] text-white"
          : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {label}
    </button>
  );
}

export function ChipGroup({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={
            value === option.value
              ? "rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white"
              : "rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-sm font-medium text-neutral-800">{label}</span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[var(--brand)]" : "bg-neutral-300"
        }`}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? "left-5" : "left-0.5"
          }`}
        />
      </span>
    </label>
  );
}

export function FieldLabel({ children }: { children: string }) {
  return (
    <span className="mb-1 block text-sm font-medium text-neutral-700">
      {children}
    </span>
  );
}

export const settingsInputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";
