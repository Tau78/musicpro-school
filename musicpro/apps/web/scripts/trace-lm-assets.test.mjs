import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = join(webRoot, "../../..");
const config = readFileSync(join(webRoot, "next.config.ts"), "utf8");
const glob = createRequire(join(webRoot, "package.json"))(
  "next/dist/compiled/glob",
);

const includePattern = "musicpro/apps/web/src/lib/last-minute/assets/**/*";
const assetsDir = join(webRoot, "src/lib/last-minute/assets");

test("asset LM runtime sotto apps/web (docs/ è in .vercelignore)", () => {
  assert.ok(config.includes(includePattern), includePattern);
  assert.ok(
    existsSync(join(assetsDir, "lm-digest-bg.jpg")),
    "lm-digest-bg.jpg",
  );
  const hits = glob.sync(includePattern, {
    cwd: workspaceRoot,
    nodir: true,
    dot: true,
  });
  assert.ok(hits.length >= 4, `glob include: ${hits.length}`);
  for (const name of [
    "Montserrat-Bold.ttf",
    "Montserrat-ExtraBold.ttf",
    "BebasNeue-Regular.ttf",
  ]) {
    assert.ok(
      existsSync(join(assetsDir, "fonts", name)),
      name,
    );
  }
});
