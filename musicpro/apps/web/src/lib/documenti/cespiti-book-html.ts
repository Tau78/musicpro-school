import {
  ACCESSORY_TAG_LABELS,
  LOCATION_PRESET_LABELS,
  type FixedAsset,
  type LocationPreset,
} from "@musicpro/database";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("it-IT");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function locationLabel(asset: FixedAsset): string {
  if (asset.locationPreset) {
    const preset = LOCATION_PRESET_LABELS[asset.locationPreset as LocationPreset];
    const custom =
      asset.locationCustom && asset.locationCustom.trim() !== ""
        ? ` — ${asset.locationCustom.trim()}`
        : "";
    return `${preset}${custom}`;
  }
  return asset.locationCustom?.trim() || "Ubicazione non specificata";
}

function accessoriesLabel(accessories: string[]): string {
  if (accessories.length === 0) return "—";
  return accessories
    .map((key) => ACCESSORY_TAG_LABELS[key as keyof typeof ACCESSORY_TAG_LABELS] ?? key)
    .join(", ");
}

function groupKey(asset: FixedAsset): string {
  return `${asset.locationPreset ?? "none"}::${asset.locationCustom ?? ""}`;
}

export function buildCespitiBookHtml(assets: FixedAsset[]): string {
  const generated = new Date().toLocaleString("it-IT");
  const groups = new Map<string, FixedAsset[]>();

  for (const asset of assets) {
    const key = groupKey(asset);
    const list = groups.get(key) ?? [];
    list.push(asset);
    groups.set(key, list);
  }

  const sortedGroups = [...groups.entries()].sort(([keyA], [keyB]) => {
    const sampleA = groups.get(keyA)?.[0];
    const sampleB = groups.get(keyB)?.[0];
    if (!sampleA || !sampleB) return 0;
    return locationLabel(sampleA).localeCompare(locationLabel(sampleB), "it", {
      sensitivity: "base",
    });
  });

  const sections = sortedGroups
    .map(([, groupAssets]) => {
      const sorted = [...groupAssets].sort((a, b) =>
        a.name.localeCompare(b.name, "it", { sensitivity: "base" }),
      );
      const heading = locationLabel(sorted[0]!);
      const rows = sorted
        .map(
          (asset) => `
        <tr>
          <td>${asset.quantity}</td>
          <td>${escapeHtml(asset.name)}</td>
          <td>${escapeHtml(asset.brand ?? "—")}</td>
          <td>${escapeHtml(asset.model ?? "—")}</td>
          <td>${escapeHtml(asset.serial ?? "—")}</td>
          <td>${escapeHtml(accessoriesLabel(asset.accessories))}</td>
          <td>${escapeHtml(formatDate(asset.purchasedAt))}</td>
          <td>${escapeHtml(asset.notes ?? "—")}</td>
        </tr>`,
        )
        .join("\n");

      return `
      <section class="location-group">
        <h2>${escapeHtml(heading)}</h2>
        <table>
          <thead>
            <tr>
              <th>N.</th>
              <th>Nome</th>
              <th>Marca</th>
              <th>Modello</th>
              <th>Seriale</th>
              <th>Accessori</th>
              <th>Acquisto</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Libro Cespiti — MusicPro School</title>
  <style>
    body {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 9pt;
      color: #1a1a1a;
      margin: 1rem;
      line-height: 1.35;
    }
    h1 { font-size: 1.35rem; margin-bottom: 0.2rem; }
    .meta { color: #555; font-size: 8pt; margin-bottom: 0.75rem; }
    .location-group {
      break-inside: avoid;
      margin-bottom: 1rem;
    }
    .location-group h2 {
      font-size: 10pt;
      margin: 0 0 0.35rem;
      border-bottom: 1px solid #ccc;
      padding-bottom: 0.15rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 0.2rem 0.35rem;
      vertical-align: top;
      text-align: left;
    }
    th { background: #f5f5f5; }
    @media print {
      body { margin: 0.5rem; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <p class="no-print"><button onclick="window.print()">Stampa / Salva PDF</button></p>
  <h1>Libro Cespiti</h1>
  <p class="meta">MusicPro School · Generato il ${escapeHtml(generated)} · ${assets.length} beni</p>
  ${sections}
</body>
</html>`;
}

export function buildCespitiCsv(assets: FixedAsset[]): string {
  const headers = [
    "id",
    "quantity",
    "name",
    "brand",
    "model",
    "serial",
    "accessories",
    "purchased_at",
    "location_preset",
    "location_custom",
    "notes",
    "disposed_at",
    "deleted_at",
    "photo_storage_path",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
  ];

  const escapeCsv = (value: string | number | null | undefined): string => {
    if (value == null) return "";
    const text = String(value);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const rows = assets.map((asset) =>
    [
      asset.id,
      asset.quantity,
      asset.name,
      asset.brand,
      asset.model,
      asset.serial,
      asset.accessories.join(";"),
      asset.purchasedAt,
      asset.locationPreset,
      asset.locationCustom,
      asset.notes,
      asset.disposedAt,
      asset.deletedAt,
      asset.photoStoragePath,
      asset.createdAt,
      asset.updatedAt,
      asset.createdBy,
      asset.updatedBy,
    ]
      .map(escapeCsv)
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}
