"use client";

import { useEffect, useRef, useState } from "react";

import {
  WEBSITE_BLOCK_TYPE_LABELS,
  WEBSITE_BLOCK_TYPES,
  WEBSITE_STORY_LAYOUT_LABELS,
  countVisibleBlocks,
  createEmptyBlock,
  type WebsiteAppsData,
  type WebsiteBlockType,
  type WebsiteHeroData,
  type WebsiteHomeBlock,
  type WebsiteLink,
  type WebsitePlaceData,
  type WebsiteReviewsData,
  type WebsiteRewavierData,
  type WebsiteSocialsData,
  type WebsiteStoryData,
  type WebsiteStoryLayout,
} from "@musicpro/database";

import { ChipGroup } from "@/components/admin/settings-chrome";
import {
  Field,
  ImageField,
  LinkFields,
} from "@/components/admin/website-fields";

const EMPTY_LINK: WebsiteLink = { label: "", href: "" };

export function WebsiteHomeEditor({
  blocks,
  selectedId,
  onSelect,
  onChange,
}: {
  blocks: WebsiteHomeBlock[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (blocks: WebsiteHomeBlock[]) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = blocks.find((block) => block.id === selectedId) ?? null;
  const extraHero = countVisibleBlocks(blocks, "hero") > 1;
  const extraPlace = countVisibleBlocks(blocks, "place") > 1;

  function move(id: string, direction: -1 | 1) {
    const index = blocks.findIndex((block) => block.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= blocks.length) return;
    const copy = [...blocks];
    const [row] = copy.splice(index, 1);
    copy.splice(next, 0, row);
    onChange(copy);
  }

  function toggleHidden(id: string) {
    onChange(
      blocks.map((block) =>
        block.id === id ? { ...block, hidden: !block.hidden } : block,
      ),
    );
  }

  function remove(id: string) {
    if (!window.confirm("Eliminare questa sezione dalla bozza?")) return;
    const next = blocks.filter((block) => block.id !== id);
    onChange(next);
    if (selectedId === id) {
      onSelect(next[0]?.id ?? null);
    }
  }

  function add(type: WebsiteBlockType) {
    const block = createEmptyBlock(type);
    const index = selected
      ? blocks.findIndex((row) => row.id === selected.id) + 1
      : blocks.length;
    const next = [...blocks];
    next.splice(index, 0, block);
    onChange(next);
    onSelect(block.id);
    setMenuOpen(false);
  }

  function replace(next: WebsiteHomeBlock) {
    onChange(blocks.map((block) => (block.id === next.id ? next : block)));
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="space-y-4">
      {extraHero ? (
        <p className="text-sm text-amber-800">
          C’è più di un Inizio visibile. Puoi salvare, ma sul sito resteranno
          entrambi finché non ne nascondi uno.
        </p>
      ) : null}
      {extraPlace ? (
        <p className="text-sm text-amber-800">
          C’è più di una Sede visibile. Puoi salvare, ma sul sito resteranno
          entrambe finché non ne nascondi una.
        </p>
      ) : null}

      <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200">
        {blocks.map((block, index) => {
          const active = block.id === selectedId;
          const title = blockTitle(block);
          return (
            <li key={block.id}>
              <div
                className={`flex items-center gap-2 px-2 py-2 ${
                  active ? "bg-[var(--brand)]/8" : "bg-white"
                } ${block.hidden ? "opacity-60" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(block.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-medium text-neutral-900">
                    {title}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {WEBSITE_BLOCK_TYPE_LABELS[block.type]}
                    {block.hidden ? " · nascosto" : ""}
                  </span>
                </button>
                <IconButton
                  label="Sposta su"
                  disabled={index === 0}
                  onClick={() => move(block.id, -1)}
                >
                  ↑
                </IconButton>
                <IconButton
                  label="Sposta giù"
                  disabled={index === blocks.length - 1}
                  onClick={() => move(block.id, 1)}
                >
                  ↓
                </IconButton>
                <IconButton
                  label={block.hidden ? "Mostra" : "Nascondi"}
                  onClick={() => toggleHidden(block.id)}
                >
                  {block.hidden ? "○" : "●"}
                </IconButton>
                <IconButton label="Elimina" onClick={() => remove(block.id)}>
                  ×
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          onClick={() => setMenuOpen((open) => !open)}
        >
          + Aggiungi sezione
        </button>
        {menuOpen ? (
          <div className="absolute z-10 mt-1 w-56 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg">
            {WEBSITE_BLOCK_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-100"
                onClick={() => add(type)}
              >
                {WEBSITE_BLOCK_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="rounded-xl border border-neutral-200 p-4">
          <p className="mb-4 text-sm font-medium text-neutral-800">
            {WEBSITE_BLOCK_TYPE_LABELS[selected.type]}
          </p>
          <BlockFields block={selected} onChange={replace} />
        </div>
      ) : (
        <p className="text-sm text-neutral-600">
          Scegli una sezione per modificarla.
        </p>
      )}
    </div>
  );
}

function blockTitle(block: WebsiteHomeBlock): string {
  const title = "title" in block.data ? block.data.title : "";
  const firstLine = title.split("\n")[0]?.trim();
  return firstLine || WEBSITE_BLOCK_TYPE_LABELS[block.type];
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-base text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function BlockFields({
  block,
  onChange,
}: {
  block: WebsiteHomeBlock;
  onChange: (block: WebsiteHomeBlock) => void;
}) {
  switch (block.type) {
    case "hero":
      return (
        <HeroFields
          data={block.data}
          onChange={(data) => onChange({ ...block, data })}
        />
      );
    case "story":
      return (
        <StoryFields
          data={block.data}
          onChange={(data) => onChange({ ...block, data })}
        />
      );
    case "apps":
      return (
        <AppsFields
          data={block.data}
          onChange={(data) => onChange({ ...block, data })}
        />
      );
    case "rewavier":
      return (
        <RewavierFields
          data={block.data}
          onChange={(data) => onChange({ ...block, data })}
        />
      );
    case "reviews":
      return (
        <ReviewsFields
          data={block.data}
          onChange={(data) => onChange({ ...block, data })}
        />
      );
    case "socials":
      return (
        <SocialsFields
          data={block.data}
          onChange={(data) => onChange({ ...block, data })}
        />
      );
    case "place":
      return (
        <PlaceFields
          data={block.data}
          onChange={(data) => onChange({ ...block, data })}
        />
      );
  }
}

function HeroFields({
  data,
  onChange,
}: {
  data: WebsiteHeroData;
  onChange: (data: WebsiteHeroData) => void;
}) {
  return (
    <div className="space-y-4">
      <Field
        label="Sopratitolo"
        value={data.kicker}
        onChange={(kicker) => onChange({ ...data, kicker })}
      />
      <Field
        label="Titolo (a capo = nuova riga)"
        value={data.title}
        multiline
        onChange={(title) => onChange({ ...data, title })}
      />
      <Field
        label="Testo"
        value={data.lede}
        multiline
        onChange={(lede) => onChange({ ...data, lede })}
      />
      <LinkFields
        label="Pulsante 1"
        value={data.cta1}
        onChange={(cta1) => onChange({ ...data, cta1 })}
      />
      <LinkFields
        label="Pulsante 2"
        value={data.cta2}
        onChange={(cta2) => onChange({ ...data, cta2 })}
      />
    </div>
  );
}

function StoryFields({
  data,
  onChange,
}: {
  data: WebsiteStoryData;
  onChange: (data: WebsiteStoryData) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-sm font-medium text-neutral-700">Impaginazione</p>
        <ChipGroup
          value={data.layout}
          options={Object.entries(WEBSITE_STORY_LAYOUT_LABELS).map(
            ([value, label]) => ({ value, label }),
          )}
          onChange={(layout) =>
            onChange({ ...data, layout: layout as WebsiteStoryLayout })
          }
        />
      </div>
      <Field
        label="Sopratitolo"
        value={data.kicker}
        onChange={(kicker) => onChange({ ...data, kicker })}
      />
      <Field
        label="Titolo"
        value={data.title}
        onChange={(title) => onChange({ ...data, title })}
      />
      <Field
        label="Citazione"
        value={data.quote ?? ""}
        onChange={(quote) => onChange({ ...data, quote: quote || undefined })}
      />
      <StringList
        label="Paragrafi"
        values={data.paragraphs}
        onChange={(paragraphs) => onChange({ ...data, paragraphs })}
      />
      <LinkList
        label="Pulsanti"
        values={data.ctas}
        onChange={(ctas) => onChange({ ...data, ctas })}
      />
      <Field
        label="Titolo elenco"
        value={data.listTitle ?? ""}
        onChange={(listTitle) =>
          onChange({ ...data, listTitle: listTitle || undefined })
        }
      />
      <StoryList
        items={data.list ?? []}
        onChange={(list) => onChange({ ...data, list })}
      />
      <ImageField
        label="Foto"
        value={data.image ?? ""}
        alt={data.imageAlt}
        onChange={(image) => onChange({ ...data, image: image || undefined })}
        onAltChange={(imageAlt) =>
          onChange({ ...data, imageAlt: imageAlt || undefined })
        }
      />
    </div>
  );
}

function AppsFields({
  data,
  onChange,
}: {
  data: WebsiteAppsData;
  onChange: (data: WebsiteAppsData) => void;
}) {
  return (
    <div className="space-y-4">
      <Field
        label="Sopratitolo"
        value={data.kicker}
        onChange={(kicker) => onChange({ ...data, kicker })}
      />
      <Field
        label="Titolo"
        value={data.title}
        onChange={(title) => onChange({ ...data, title })}
      />
      <Field
        label="Testo"
        value={data.lede}
        multiline
        onChange={(lede) => onChange({ ...data, lede })}
      />
      {data.items.map((item, index) => (
        <div key={index} className="space-y-3 rounded-xl border border-neutral-200 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-800">App {index + 1}</p>
            <button
              type="button"
              className="text-sm text-neutral-600 hover:text-red-700"
              onClick={() =>
                onChange({
                  ...data,
                  items: data.items.filter((_, itemIndex) => itemIndex !== index),
                })
              }
            >
              Rimuovi
            </button>
          </div>
          <Field
            label="Nome"
            value={item.name}
            onChange={(name) => {
              const items = [...data.items];
              items[index] = { ...item, name };
              onChange({ ...data, items });
            }}
          />
          <Field
            label="Testo"
            value={item.text}
            multiline
            onChange={(text) => {
              const items = [...data.items];
              items[index] = { ...item, text };
              onChange({ ...data, items });
            }}
          />
          <Field
            label="Link"
            value={item.href}
            onChange={(href) => {
              const items = [...data.items];
              items[index] = { ...item, href };
              onChange({ ...data, items });
            }}
          />
          <Field
            label="Pulsante"
            value={item.cta}
            onChange={(cta) => {
              const items = [...data.items];
              items[index] = { ...item, cta };
              onChange({ ...data, items });
            }}
          />
        </div>
      ))}
      <button
        type="button"
        className="text-sm font-medium text-[var(--brand)]"
        onClick={() =>
          onChange({
            ...data,
            items: [...data.items, { name: "", text: "", href: "", cta: "" }],
          })
        }
      >
        + App
      </button>
    </div>
  );
}

function RewavierFields({
  data,
  onChange,
}: {
  data: WebsiteRewavierData;
  onChange: (data: WebsiteRewavierData) => void;
}) {
  return (
    <div className="space-y-4">
      <Field
        label="Sopratitolo"
        value={data.kicker}
        onChange={(kicker) => onChange({ ...data, kicker })}
      />
      <Field
        label="Titolo"
        value={data.title}
        onChange={(title) => onChange({ ...data, title })}
      />
      <StringList
        label="Paragrafi"
        values={data.paragraphs}
        onChange={(paragraphs) => onChange({ ...data, paragraphs })}
      />
      <LinkFields
        label="Pulsante"
        value={data.cta}
        onChange={(cta) => onChange({ ...data, cta })}
      />
    </div>
  );
}

function ReviewsFields({
  data,
  onChange,
}: {
  data: WebsiteReviewsData;
  onChange: (data: WebsiteReviewsData) => void;
}) {
  return (
    <div className="space-y-4">
      <Field
        label="Sopratitolo"
        value={data.kicker}
        onChange={(kicker) => onChange({ ...data, kicker })}
      />
      <Field
        label="Titolo"
        value={data.title}
        onChange={(title) => onChange({ ...data, title })}
      />
      <Field
        label="Testo"
        value={data.lede}
        multiline
        onChange={(lede) => onChange({ ...data, lede })}
      />
      <StringList
        label="Recensioni"
        values={data.items}
        onChange={(items) => onChange({ ...data, items })}
      />
      <LinkFields
        label="Pulsante 1"
        value={data.cta1}
        onChange={(cta1) => onChange({ ...data, cta1 })}
      />
      <LinkFields
        label="Pulsante 2"
        value={data.cta2}
        onChange={(cta2) => onChange({ ...data, cta2 })}
      />
    </div>
  );
}

function SocialsFields({
  data,
  onChange,
}: {
  data: WebsiteSocialsData;
  onChange: (data: WebsiteSocialsData) => void;
}) {
  return (
    <div className="space-y-4">
      <Field
        label="Sopratitolo"
        value={data.kicker}
        onChange={(kicker) => onChange({ ...data, kicker })}
      />
      <Field
        label="Titolo"
        value={data.title}
        onChange={(title) => onChange({ ...data, title })}
      />
      <Field
        label="Testo"
        value={data.lede}
        multiline
        onChange={(lede) => onChange({ ...data, lede })}
      />
      {data.items.map((item, index) => (
        <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Field
            label="Nome"
            value={item.name}
            onChange={(name) => {
              const items = [...data.items];
              items[index] = { ...item, name };
              onChange({ ...data, items });
            }}
          />
          <Field
            label="Handle"
            value={item.handle}
            onChange={(handle) => {
              const items = [...data.items];
              items[index] = { ...item, handle };
              onChange({ ...data, items });
            }}
          />
          <Field
            label="Link"
            value={item.href}
            onChange={(href) => {
              const items = [...data.items];
              items[index] = { ...item, href };
              onChange({ ...data, items });
            }}
          />
          <button
            type="button"
            className="self-end pb-2 text-sm text-neutral-600 hover:text-red-700"
            onClick={() =>
              onChange({
                ...data,
                items: data.items.filter((_, itemIndex) => itemIndex !== index),
              })
            }
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-sm font-medium text-[var(--brand)]"
        onClick={() =>
          onChange({
            ...data,
            items: [...data.items, { name: "", handle: "", href: "" }],
          })
        }
      >
        + Canale
      </button>
    </div>
  );
}

function PlaceFields({
  data,
  onChange,
}: {
  data: WebsitePlaceData;
  onChange: (data: WebsitePlaceData) => void;
}) {
  return (
    <div className="space-y-4">
      <Field
        label="Sopratitolo"
        value={data.kicker}
        onChange={(kicker) => onChange({ ...data, kicker })}
      />
      <Field
        label="Titolo (a capo = nuova riga)"
        value={data.title}
        multiline
        onChange={(title) => onChange({ ...data, title })}
      />
      <Field
        label="Testo"
        value={data.lede}
        multiline
        onChange={(lede) => onChange({ ...data, lede })}
      />
      <Field
        label="Ragione sociale"
        value={data.legal}
        onChange={(legal) => onChange({ ...data, legal })}
      />
      <Field
        label="Indirizzo"
        value={data.address}
        onChange={(address) => onChange({ ...data, address })}
      />
      <Field
        label="Email"
        value={data.email}
        onChange={(email) => onChange({ ...data, email })}
      />
      <Field
        label="Telefono"
        value={data.phone}
        onChange={(phone) => onChange({ ...data, phone })}
      />
      <Field
        label="Link telefono"
        value={data.phoneHref}
        onChange={(phoneHref) => onChange({ ...data, phoneHref })}
      />
      <LinkFields
        label="Pulsante associato"
        value={data.cta1}
        onChange={(cta1) => onChange({ ...data, cta1 })}
      />
      <LinkFields
        label="Google Maps"
        value={data.mapsGoogle}
        onChange={(mapsGoogle) => onChange({ ...data, mapsGoogle })}
      />
      <LinkFields
        label="Apple Mappe"
        value={data.mapsApple}
        onChange={(mapsApple) => onChange({ ...data, mapsApple })}
      />
      <ImageField
        label="Foto 1"
        value={data.image1}
        alt={data.image1Alt}
        onChange={(image1) => onChange({ ...data, image1 })}
        onAltChange={(image1Alt) => onChange({ ...data, image1Alt })}
      />
      <ImageField
        label="Foto 2"
        value={data.image2}
        alt={data.image2Alt}
        onChange={(image2) => onChange({ ...data, image2 })}
        onAltChange={(image2Alt) => onChange({ ...data, image2Alt })}
      />
    </div>
  );
}

function StringList({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-neutral-700">{label}</p>
      {values.map((value, index) => (
        <div key={index} className="flex gap-2">
          <div className="flex-1">
            <Field
              label={`${label} ${index + 1}`}
              value={value}
              multiline
              onChange={(next) => {
                const copy = [...values];
                copy[index] = next;
                onChange(copy);
              }}
            />
          </div>
          <button
            type="button"
            className="mt-7 text-sm text-neutral-600 hover:text-red-700"
            onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-sm font-medium text-[var(--brand)]"
        onClick={() => onChange([...values, ""])}
      >
        + {label}
      </button>
    </div>
  );
}

function LinkList({
  label,
  values,
  onChange,
}: {
  label: string;
  values: WebsiteLink[];
  onChange: (values: WebsiteLink[]) => void;
}) {
  return (
    <div className="space-y-3">
      {values.map((value, index) => (
        <div key={index} className="flex items-start gap-2">
          <div className="flex-1">
            <LinkFields
              label={`${label} ${index + 1}`}
              value={value}
              onChange={(next) => {
                const copy = [...values];
                copy[index] = next;
                onChange(copy);
              }}
            />
          </div>
          <button
            type="button"
            className="mt-7 text-sm text-neutral-600 hover:text-red-700"
            onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-sm font-medium text-[var(--brand)]"
        onClick={() => onChange([...values, { ...EMPTY_LINK }])}
      >
        + {label}
      </button>
    </div>
  );
}

function StoryList({
  items,
  onChange,
}: {
  items: { label: string; href?: string }[];
  onChange: (items: { label: string; href?: string }[]) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-neutral-700">Elenco</p>
      {items.map((item, index) => (
        <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Field
            label="Voce"
            value={item.label}
            onChange={(label) => {
              const copy = [...items];
              copy[index] = { ...item, label };
              onChange(copy);
            }}
          />
          <Field
            label="Link (opzionale)"
            value={item.href ?? ""}
            onChange={(href) => {
              const copy = [...items];
              copy[index] = { ...item, href: href || undefined };
              onChange(copy);
            }}
          />
          <button
            type="button"
            className="self-end pb-2 text-sm text-neutral-600 hover:text-red-700"
            onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-sm font-medium text-[var(--brand)]"
        onClick={() => onChange([...items, { label: "" }])}
      >
        + Voce
      </button>
    </div>
  );
}
