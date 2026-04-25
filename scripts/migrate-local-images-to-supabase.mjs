#!/usr/bin/env node
/**
 * Upload local bill images to the theConfessional Supabase bucket.
 *
 * Usage:
 *   node scripts/migrate-local-images-to-supabase.mjs ./exported-bills
 *
 * Expected filename format: YYYY-MM-DD.jpg|jpeg|png|webp
 */

import fs from "node:fs/promises";
import path from "node:path";

const SB = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sourceDir = process.argv[2];

if (!SB || !KEY || !sourceDir) {
  console.error("Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-local-images-to-supabase.mjs <directory>");
  process.exit(1);
}

const DATE_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.(jpg|jpeg|png|webp)$/i;

const sbHeaders = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  "Accept-Profile": "theConfessional",
  "Content-Profile": "theConfessional",
};

function mimeForExt(ext) {
  const e = ext.toLowerCase();
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  return "image/jpeg";
}

async function patchBillImage(date, imagePath, mimeType) {
  const r = await fetch(`${SB}/rest/v1/bills?bill_date=eq.${encodeURIComponent(date)}`, {
    method: "PATCH",
    headers: { ...sbHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ image_path: imagePath, image_mime: mimeType }),
  });
  if (!r.ok) throw new Error(`Patch bill ${date} failed: ${r.status} ${await r.text()}`);
}

async function uploadOne(absPath, date, ext) {
  const bytes = await fs.readFile(absPath);
  const mimeType = mimeForExt(ext);
  const objectPath = `bills/${date}.${ext.toLowerCase()}`;
  const upload = await fetch(
    `${SB}/storage/v1/object/theConfessional/${objectPath}?upsert=true`,
    {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": mimeType,
      },
      body: bytes,
    },
  );
  if (!upload.ok && upload.status !== 409) {
    throw new Error(`Upload ${objectPath} failed: ${upload.status} ${await upload.text()}`);
  }
  await patchBillImage(date, objectPath, mimeType);
}

async function main() {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  const candidates = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => DATE_FILE_RE.test(name));
  for (const filename of candidates) {
    const [, date, ext] = filename.match(DATE_FILE_RE);
    const abs = path.join(sourceDir, filename);
    try {
      await uploadOne(abs, date, ext);
      console.log("uploaded", filename);
    } catch (e) {
      console.error("failed", filename, e.message || e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
