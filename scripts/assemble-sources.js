#!/usr/bin/env node
/**
 * Reensambla archivos fuente grandes a partir de partes en scripts/source-parts/
 * Se ejecuta en preinstall/prebuild para que EAS tenga el código completo.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PARTS = path.join(__dirname, "source-parts");

const targets = [
  { out: "app/admin/venues.tsx", dir: "venues" },
  { out: "app/(tabs)/profile.tsx", dir: "profile" },
  { out: "components/events-screen.tsx", dir: "events" },
];

for (const t of targets) {
  const dir = path.join(PARTS, t.dir);
  if (!fs.existsSync(dir)) {
    console.warn("[assemble-sources] skip missing", t.dir);
    continue;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();
  const content = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("");
  const outPath = path.join(ROOT, t.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content);
  console.log("[assemble-sources]", t.out, content.length, "bytes from", files.length, "parts");
}
