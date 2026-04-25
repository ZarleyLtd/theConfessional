#!/usr/bin/env node
/**
 * One-time migration from legacy Google Apps Script backend to Supabase.
 *
 * Required env:
 * - LEGACY_API_URL
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

const LEGACY = process.env.LEGACY_API_URL?.replace(/\/$/, "");
const SB = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!LEGACY || !SB || !KEY) {
  console.error("Set LEGACY_API_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sbHeaders = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  "Accept-Profile": "theConfessional",
  "Content-Profile": "theConfessional",
  Prefer: "return=minimal,resolution=merge-duplicates",
};

function legacyQueryUrl(action, params = {}) {
  const u = new URL(LEGACY);
  u.searchParams.set("action", action);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function legacyGet(action, params = {}) {
  const r = await fetch(legacyQueryUrl(action, params));
  const j = await r.json();
  if (j.error) throw new Error(`Legacy ${action}: ${j.error}`);
  return j.data;
}

async function sbUpsert(table, rows, conflict = null) {
  if (!rows.length) return;
  const url = new URL(`${SB}/rest/v1/${table}`);
  if (conflict) url.searchParams.set("on_conflict", conflict);
  const r = await fetch(url, {
    method: "POST",
    headers: sbHeaders,
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    throw new Error(`Supabase insert ${table}: ${r.status} ${await r.text()}`);
  }
}

async function sbDeleteDate(table, date) {
  const r = await fetch(
    `${SB}/rest/v1/${table}?bill_date=eq.${encodeURIComponent(date)}`,
    {
      method: "DELETE",
      headers: sbHeaders,
    },
  );
  if (!r.ok) throw new Error(`Supabase delete ${table}: ${r.status} ${await r.text()}`);
}

async function sbUploadImage(date, base64, mimeType) {
  const path = `bills/${date}.jpg`;
  const bin = Buffer.from(base64, "base64");
  const r = await fetch(
    `${SB}/storage/v1/object/theConfessional/${path}?upsert=true`,
    {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": mimeType || "image/jpeg",
      },
      body: bin,
    },
  );
  if (!r.ok && r.status !== 409) {
    throw new Error(`Storage upload: ${r.status} ${await r.text()}`);
  }
  return path;
}

async function migrateConfig() {
  const names = await legacyGet("config");
  const icons = await legacyGet("productIcons");
  await sbUpsert(
    "config_names",
    (names || []).map((name) => ({ name })),
    "name",
  );
  await sbUpsert(
    "product_icons",
    (icons || []).map((row) => ({ product: row.product, image: row.image })),
    "product,image",
  );
}

async function migrateDate(date) {
  const bill = await legacyGet("bill", { date });
  const claims = await legacyGet("claims", { date });
  const summary = await legacyGet("getBillFull", { date });

  const imagePath = bill?.metadata?.billImageUrl
    ? await legacyGet("getBillImage", { date })
      .then((img) => sbUploadImage(date, img.base64, img.mimeType))
      .catch(() => null)
    : null;

  await sbUpsert("bills", [{
    bill_date: date,
    open: summary?.inFlight ? null : !!summary?.open,
    total_paid: summary?.totalPaid ?? null,
    image_path: imagePath,
    image_mime: imagePath ? "image/jpeg" : null,
  }], "bill_date");

  await sbDeleteDate("bill_items", date);
  await sbDeleteDate("claims", date);

  await sbUpsert(
    "bill_items",
    (bill?.items || []).map((it, idx) => ({
      bill_date: date,
      row_index: Number.isFinite(it.rowIndex) ? it.rowIndex : idx,
      category: it.category ?? "",
      description: it.description ?? "",
      quantity: it.quantity ?? 0,
      unit_price: it.unit_price ?? 0,
      total_price: it.total_price ?? 0,
    })),
  );
  await sbUpsert(
    "claims",
    (claims || []).map((c) => ({
      bill_date: date,
      user_name: c.userName,
      row_index: c.rowIndex,
      unit_index: c.unitIndex,
    })),
  );
}

async function main() {
  const dates = await legacyGet("dates");
  const allDates = Array.from(new Set((dates || []).map((d) => d.date).filter(Boolean))).sort();
  console.log(`Migrating ${allDates.length} bill dates...`);
  await migrateConfig();
  for (const date of allDates) {
    try {
      await migrateDate(date);
      console.log("migrated", date);
    } catch (e) {
      console.error("failed", date, e.message || e);
    }
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
