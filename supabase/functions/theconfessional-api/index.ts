import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import {
  decode as base64Decode,
  encode as base64Encode,
} from "https://deno.land/std@0.208.0/encoding/base64.ts";

const SCHEMA = "theConfessional";
const BUCKET = "theConfessional";
const IMAGE_PREFIX = "bills/";

const GEMINI_BILL_DEFAULT_MODEL = "gemini-3-flash-preview";
const GEMINI_BILL_ALLOWED_MODELS: Record<string, boolean> = {
  "gemini-2.5-flash": true,
  "gemini-2.5-flash-lite": true,
  "gemini-3-flash-preview": true,
  "gemini-3.1-flash-lite-preview": true,
  "gemma-3-27b-it": true,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function responseJson(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(String(v));
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeUserName(v: unknown): string {
  return String(v || "").toLowerCase().trim();
}

async function getDatesWithBills(sb: ReturnType<typeof createClient>) {
  const { data, error } = await sb.from("bills").select("bill_date, open").not(
    "open",
    "is",
    null,
  ).order("bill_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r: { bill_date: string; open: boolean }) => ({
    date: formatDate(r.bill_date),
    open: r.open === true,
  })).filter((r: { date: string | null }) => !!r.date);
}

async function getBillMetaForDate(
  sb: ReturnType<typeof createClient>,
  dateStr: string,
) {
  const { data, error } = await sb.from("bills").select(
    "bill_date, open, total_paid, image_path, image_mime",
  ).eq("bill_date", dateStr).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return {
      billImageId: null,
      open: false,
      totalPaid: null,
      inFlight: false,
      imageMime: null,
    };
  }
  const o = data.open;
  return {
    billImageId: data.image_path || null,
    open: o === true,
    totalPaid: data.total_paid != null ? Number(data.total_paid) : null,
    inFlight: o === null,
    imageMime: data.image_mime || null,
  };
}

async function getBillForDate(sb: ReturnType<typeof createClient>, date: string) {
  const dateStr = formatDate(date);
  if (!dateStr) return { items: [], metadata: { billImageUrl: null, totalPaid: null } };
  const { data, error } = await sb.from("bill_items").select(
    "row_index, category, description, quantity, unit_price, total_price",
  ).eq("bill_date", dateStr).order("row_index", { ascending: true });
  if (error) throw new Error(error.message);
  const meta = await getBillMetaForDate(sb, dateStr);
  return {
    items: (data || []).map((r: Record<string, unknown>) => ({
      rowIndex: Number(r.row_index) || 0,
      category: String(r.category || ""),
      description: String(r.description || ""),
      quantity: Number(r.quantity) || 0,
      unit_price: Number(r.unit_price) || 0,
      total_price: Number(r.total_price) || 0,
    })),
    metadata: {
      billImageUrl: meta.billImageId ? meta.billImageId : null,
      totalPaid: meta.totalPaid,
    },
  };
}

async function getClaimsForDate(sb: ReturnType<typeof createClient>, date: string) {
  const dateStr = formatDate(date);
  if (!dateStr) return [];
  const { data, error } = await sb.from("claims").select(
    "bill_date, user_name, row_index, unit_index",
  ).eq("bill_date", dateStr).order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r: Record<string, unknown>) => ({
    date: formatDate(r.bill_date),
    userName: String(r.user_name || ""),
    rowIndex: Number(r.row_index) || 0,
    unitIndex: Number(r.unit_index) || 0,
  }));
}

async function getConfigNames(sb: ReturnType<typeof createClient>) {
  const { data, error } = await sb.from("config_names").select("name").order("name");
  if (error) throw new Error(error.message);
  return (data || []).map((r: { name: string }) => r.name).filter(Boolean);
}

async function getProductIcons(sb: ReturnType<typeof createClient>) {
  const { data, error } = await sb.from("product_icons").select("product, image");
  if (error) throw new Error(error.message);
  return (data || []).map((r: { product: string; image: string }) => ({
    product: r.product,
    image: r.image,
  }));
}

async function getBillImage(sb: ReturnType<typeof createClient>, date: string) {
  const dateStr = formatDate(date);
  if (!dateStr) throw new Error("Invalid date");
  const meta = await getBillMetaForDate(sb, dateStr);
  if (!meta.billImageId) throw new Error("No bill image for this date");
  const { data, error } = await sb.storage.from(BUCKET).download(meta.billImageId);
  if (error || !data) throw new Error(error?.message || "Failed to load image");
  const bytes = new Uint8Array(await data.arrayBuffer());
  return {
    mimeType: meta.imageMime || data.type || "image/jpeg",
    base64: base64Encode(bytes),
  };
}

async function getAllBillsFull(sb: ReturnType<typeof createClient>) {
  const { data: billsData, error: billsErr } = await sb.from("bill_items").select(
    "bill_date, row_index, category, description, quantity, unit_price, total_price",
  ).order("bill_date", { ascending: true }).order("row_index", { ascending: true });
  if (billsErr) throw new Error(billsErr.message);
  const { data: metaData, error: metaErr } = await sb.from("bills").select(
    "bill_date, open",
  );
  if (metaErr) throw new Error(metaErr.message);
  const { data: claimsData, error: claimsErr } = await sb.from("claims").select(
    "bill_date, user_name, row_index, unit_index",
  );
  if (claimsErr) throw new Error(claimsErr.message);

  const itemsByDate: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of billsData || []) {
    const d = formatDate((row as Record<string, unknown>).bill_date);
    if (!d) continue;
    if (!itemsByDate[d]) itemsByDate[d] = [];
    itemsByDate[d].push({
      rowIndex: Number((row as Record<string, unknown>).row_index) || 0,
      category: String((row as Record<string, unknown>).category || ""),
      description: String((row as Record<string, unknown>).description || ""),
      quantity: Number((row as Record<string, unknown>).quantity) || 0,
      unit_price: Number((row as Record<string, unknown>).unit_price) || 0,
      total_price: Number((row as Record<string, unknown>).total_price) || 0,
    });
  }

  const openByDate: Record<string, boolean | null> = {};
  for (const row of metaData || []) {
    const d = formatDate((row as Record<string, unknown>).bill_date);
    if (!d) continue;
    openByDate[d] = (row as Record<string, unknown>).open as boolean | null;
  }

  const claimsByDate: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of claimsData || []) {
    const d = formatDate((row as Record<string, unknown>).bill_date);
    if (!d) continue;
    if (!claimsByDate[d]) claimsByDate[d] = [];
    claimsByDate[d].push({
      date: d,
      userName: String((row as Record<string, unknown>).user_name || ""),
      rowIndex: Number((row as Record<string, unknown>).row_index) || 0,
      unitIndex: Number((row as Record<string, unknown>).unit_index) || 0,
    });
  }

  const dates = Object.keys(itemsByDate).sort();
  return {
    bills: dates.map((d) => ({
      date: d,
      open: openByDate[d] === true,
      inFlight: openByDate[d] === null,
      items: itemsByDate[d] || [],
      claims: claimsByDate[d] || [],
    })),
  };
}

async function getBillsSummary(sb: ReturnType<typeof createClient>) {
  const full = await getAllBillsFull(sb);
  const bills = (full.bills || []).map((b: Record<string, unknown>) => {
    const items = (b.items as Array<Record<string, unknown>>) || [];
    const claims = (b.claims as Array<Record<string, unknown>>) || [];
    const claimMap: Record<string, string> = {};
    for (const c of claims) {
      claimMap[`${c.rowIndex}_${c.unitIndex}`] = String(c.userName || "");
    }
    let allClaimed = items.length > 0;
    for (const it of items) {
      const qty = Number(it.quantity) || 0;
      for (let i = 0; i < qty; i++) {
        if (!claimMap[`${it.rowIndex}_${i}`]) {
          allClaimed = false;
          break;
        }
      }
      if (!allClaimed) break;
    }
    return {
      date: b.date,
      open: b.open === true,
      inFlight: b.inFlight === true,
      hasClaims: claims.length > 0,
      allClaimed,
    };
  });
  return { bills };
}

async function getBillFull(sb: ReturnType<typeof createClient>, date: string) {
  const dateStr = formatDate(date);
  if (!dateStr) throw new Error("Invalid date");
  const billData = await getBillForDate(sb, dateStr);
  const claimsData = await getClaimsForDate(sb, dateStr);
  const meta = await getBillMetaForDate(sb, dateStr);
  return {
    date: dateStr,
    open: meta.open === true,
    inFlight: meta.inFlight === true,
    totalPaid: meta.totalPaid,
    items: billData.items || [],
    claims: claimsData || [],
  };
}

function parseGeminiBillJson(text: string) {
  const cleaned = String(text).replace(/```json\s*/g, "").replace(/```\s*/g, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse model response");
  const parsed = JSON.parse(match[0]) as {
    date?: string;
    items?: Array<Record<string, unknown>>;
  };
  if (!Array.isArray(parsed.items)) parsed.items = [];
  parsed.date = formatDate(parsed.date) || formatDate(new Date()) || "";
  return parsed;
}

function sumBillItemsTotals(items: Array<Record<string, unknown>>) {
  return (items || []).reduce((sum, it) => {
    const tp = Number(it.total_price);
    if (!isNaN(tp)) return sum + tp;
    const up = Number(it.unit_price) || 0;
    const q = Number(it.quantity) || 1;
    return sum + (up * q);
  }, 0);
}

async function analyzeBillImage(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const base64 = String(body.base64 || "").replace(/\s/g, "");
  const mimeType = String(body.mimeType || "image/jpeg");
  if (!base64) throw new Error("Missing image data");
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  let modelId = GEMINI_BILL_DEFAULT_MODEL;
  const requested = String(body.geminiModel || "");
  if (requested && GEMINI_BILL_ALLOWED_MODELS[requested]) modelId = requested;

  const prompt =
    'Analyze this receipt/bill image and extract all line items. Return ONLY valid JSON (no markdown, no code blocks) with this exact structure: {"date":"YYYY-MM-DD","items":[{"category":"Food" or "Fries" or "Drink","description":"item name","quantity":1,"unit_price":12.00,"total_price":12.00}]}. Use category "Food" for main dishes/sandwiches, "Fries" for fries/sides, "Drink" for beverages. If you cannot determine the date, use today in YYYY-MM-DD.';
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${
      encodeURIComponent(apiKey)
    }`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: prompt },
        ],
      }],
    }),
  });
  if (!response.ok) throw new Error("Gemini API error: " + response.status);
  const json = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) throw new Error("No extraction result from Gemini");

  const parsed = parseGeminiBillJson(text);
  const dateStr = String(parsed.date);
  const { data: existing, error: existingErr } = await sb.from("bills").select(
    "bill_date, open",
  ).eq("bill_date", dateStr).maybeSingle();
  if (existingErr) throw new Error(existingErr.message);
  if (existing && existing.open !== null) {
    throw new Error(
      "A bill already exists for " + dateStr +
        ". Delete it first if you want to replace it.",
    );
  }

  await sb.from("upload_jobs").delete().lt(
    "created_at",
    new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString(),
  );
  const jobId = crypto.randomUUID();
  const { error: insErr } = await sb.from("upload_jobs").insert({
    job_id: jobId,
    analysis: parsed,
  });
  if (insErr) throw new Error(insErr.message);
  return { jobId, date: dateStr, billTotal: sumBillItemsTotals(parsed.items || []) };
}

async function replaceBillItemsForDate(
  sb: ReturnType<typeof createClient>,
  dateStr: string,
  items: Array<Record<string, unknown>>,
) {
  const { error: delErr } = await sb.from("bill_items").delete().eq("bill_date", dateStr);
  if (delErr) throw new Error(delErr.message);
  if (!items.length) return;
  const rows = items.map((it, i) => {
    const quantity = parseInt(String(it.quantity), 10) || 1;
    const unitPrice = Number(it.unit_price) || 0;
    const totalPrice = !isNaN(Number(it.total_price))
      ? Number(it.total_price)
      : (unitPrice * quantity);
    return {
      bill_date: dateStr,
      row_index: i,
      category: String(it.category || "Drink"),
      description: String(it.description || ""),
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
    };
  });
  const { error: insErr } = await sb.from("bill_items").insert(rows);
  if (insErr) throw new Error(insErr.message);
}

async function completeBillUpload(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const jobId = String(body.jobId || "");
  if (!jobId) throw new Error("Missing jobId");
  const hasPaidAmount = body.paidAmount !== undefined && body.paidAmount !== null &&
    String(body.paidAmount).trim() !== "";
  const paidAmount = Number(body.paidAmount);
  if (hasPaidAmount && (isNaN(paidAmount) || paidAmount < 0)) {
    throw new Error("Invalid paidAmount");
  }

  const { data: stored, error: jobErr } = await sb.from("upload_jobs").select(
    "analysis",
  ).eq("job_id", jobId).maybeSingle();
  if (jobErr) throw new Error(jobErr.message);
  if (!stored) throw new Error("Analysis expired or invalid jobId");
  const analysis = stored.analysis as { date: string; items?: Array<Record<string, unknown>> };
  const dateStr = formatDate(analysis.date) || formatDate(new Date()) as string;
  const items = analysis.items || [];

  let imagePath: string | null = null;
  let imageMime: string | null = null;
  const base64 = String(body.base64 || "").replace(/\s/g, "");
  if (base64) {
    imagePath = `${IMAGE_PREFIX}${dateStr}-${Date.now()}.jpg`;
    imageMime = String(body.mimeType || "image/jpeg");
    const bytes = base64Decode(base64);
    const { error: upErr } = await sb.storage.from(BUCKET).upload(imagePath, bytes, {
      contentType: imageMime,
      upsert: true,
    });
    if (upErr) throw new Error(upErr.message);
  }

  const { data: existing, error: existingErr } = await sb.from("bills").select(
    "bill_date, open, image_path",
  ).eq("bill_date", dateStr).maybeSingle();
  if (existingErr) throw new Error(existingErr.message);

  if (!hasPaidAmount) {
    if (existing && existing.open !== null) {
      throw new Error(
        "A bill already exists for " + dateStr +
          ". Delete it first if you want to replace it.",
      );
    }
    if (existing?.image_path) {
      await sb.storage.from(BUCKET).remove([String(existing.image_path)]);
    }
    if (existing) {
      const { error: upMetaErr } = await sb.from("bills").update({
        image_path: imagePath || null,
        image_mime: imageMime || null,
        open: null,
        total_paid: null,
      }).eq("bill_date", dateStr);
      if (upMetaErr) throw new Error(upMetaErr.message);
    } else {
      const { error: insMetaErr } = await sb.from("bills").insert({
        bill_date: dateStr,
        image_path: imagePath || null,
        image_mime: imageMime || null,
        open: null,
        total_paid: null,
      });
      if (insMetaErr) throw new Error(insMetaErr.message);
    }
    await replaceBillItemsForDate(sb, dateStr, items);
  } else {
    if (existing) throw new Error("A bill already exists for " + dateStr + ".");
    const { error: insMetaErr } = await sb.from("bills").insert({
      bill_date: dateStr,
      image_path: imagePath || null,
      image_mime: imageMime || null,
      open: true,
      total_paid: paidAmount,
    });
    if (insMetaErr) throw new Error(insMetaErr.message);
    await replaceBillItemsForDate(sb, dateStr, items);
  }

  await sb.from("upload_jobs").delete().eq("job_id", jobId);
  const billTotal = sumBillItemsTotals(items);
  const tipAmount = hasPaidAmount ? Math.max(0, paidAmount - billTotal) : null;
  return {
    date: dateStr,
    billTotal,
    tipAmount,
    totalPaid: hasPaidAmount ? paidAmount : null,
  };
}

async function updateBillTotalPaid(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const dateStr = formatDate(body.date);
  const paid = Number(body.totalPaid);
  if (!dateStr) throw new Error("Invalid date");
  if (isNaN(paid) || paid < 0) throw new Error("Invalid totalPaid");
  const bill = await getBillForDate(sb, dateStr);
  const billTotal = sumBillItemsTotals(bill.items || []);
  const tipAmount = Math.max(0, paid - billTotal);
  const { error } = await sb.from("bills").update({ total_paid: paid }).eq(
    "bill_date",
    dateStr,
  );
  if (error) throw new Error(error.message);
  return { date: dateStr, billTotal, tipAmount, totalPaid: paid };
}

async function setBillOpen(sb: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const dateStr = formatDate(body.date);
  if (!dateStr) throw new Error("Invalid date");
  const open = body.open === true;
  const { error } = await sb.from("bills").update({ open }).eq("bill_date", dateStr);
  if (error) throw new Error(error.message);
  return { ok: true, open };
}

async function deleteBill(sb: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const dateStr = formatDate(body.date);
  if (!dateStr) throw new Error("Invalid date");
  const claims = await getClaimsForDate(sb, dateStr);
  if (claims.length > 0) {
    throw new Error(
      "Cannot delete bill: some items are still claimed. Remove all claims first.",
    );
  }
  const meta = await getBillMetaForDate(sb, dateStr);
  if (meta.billImageId) {
    await sb.storage.from(BUCKET).remove([meta.billImageId]);
  }
  const { error } = await sb.from("bills").delete().eq("bill_date", dateStr);
  if (error) throw new Error(error.message);
  return { ok: true };
}

function resolveClaimsSubmission(
  billItems: Array<{
    rowIndex: number;
    quantity: number;
  }>,
  existingClaims: Array<{ userName: string; rowIndex: number; unitIndex: number }>,
  userName: string,
  claims: Array<{ rowIndex: number; unitIndex: number }>,
) {
  const validSlots: Record<string, boolean> = {};
  for (const item of billItems) {
    for (let u = 0; u < item.quantity; u++) validSlots[`${item.rowIndex}_${u}`] = true;
  }
  for (const claim of claims) {
    const slot = `${claim.rowIndex}_${claim.unitIndex}`;
    if (!validSlots[slot]) throw new Error(`Invalid slot: rowIndex ${claim.rowIndex}, unitIndex ${claim.unitIndex}`);
  }
  const mine = normalizeUserName(userName);
  const claimedByOthers: Record<string, boolean> = {};
  for (const c of existingClaims) {
    if (normalizeUserName(c.userName) === mine) continue;
    claimedByOthers[`${c.rowIndex}_${c.unitIndex}`] = true;
  }
  for (const claim of claims) {
    if (claimedByOthers[`${claim.rowIndex}_${claim.unitIndex}`]) {
      throw new Error(`Slot already claimed by another user: rowIndex ${claim.rowIndex}, unitIndex ${claim.unitIndex}`);
    }
  }
  return claims;
}

async function submitClaims(sb: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const dateStr = formatDate(body.date);
  const userName = String(body.userName || "");
  const claims = Array.isArray(body.claims)
    ? body.claims as Array<{ rowIndex: number; unitIndex: number }>
    : [];
  if (!dateStr || !userName) throw new Error("Missing date or userName");

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    throw new Error(
      "SUPABASE_DB_URL must be set for transactional submitClaims",
    );
  }
  const client = new Client(dbUrl);
  await client.connect();
  try {
    await client.queryArray`BEGIN`;
    await client.queryArray`SELECT pg_advisory_xact_lock(hashtext(${dateStr}))`;
    const itemsRes = await client.queryObject<{ row_index: number; quantity: number }>`
      SELECT row_index, quantity FROM "theConfessional".bill_items WHERE bill_date = ${dateStr}::date ORDER BY row_index
    `;
    const claimsRes = await client.queryObject<{ user_name: string; row_index: number; unit_index: number }>`
      SELECT user_name, row_index, unit_index FROM "theConfessional".claims WHERE bill_date = ${dateStr}::date
    `;
    resolveClaimsSubmission(
      (itemsRes.rows || []).map((r) => ({
        rowIndex: Number(r.row_index) || 0,
        quantity: Number(r.quantity) || 0,
      })),
      (claimsRes.rows || []).map((r) => ({
        userName: String(r.user_name || ""),
        rowIndex: Number(r.row_index) || 0,
        unitIndex: Number(r.unit_index) || 0,
      })),
      userName,
      claims,
    );
    const userNorm = normalizeUserName(userName);
    await client.queryObject`
      DELETE FROM "theConfessional".claims
      WHERE bill_date = ${dateStr}::date
      AND lower(trim(user_name)) = ${userNorm}
    `;
    for (const c of claims) {
      await client.queryObject`
        INSERT INTO "theConfessional".claims (bill_date, user_name, row_index, unit_index)
        VALUES (${dateStr}::date, ${userName}, ${c.rowIndex}, ${c.unitIndex})
      `;
    }
    await client.queryArray`COMMIT`;
  } catch (e) {
    await client.queryArray`ROLLBACK`;
    throw e;
  } finally {
    await client.end();
  }
  const updatedClaims = await getClaimsForDate(sb, dateStr);
  return { ok: true, count: claims.length, claims: updatedClaims };
}

type FinBillItem = {
  rowIndex: number;
  category: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
};

type FinClaim = {
  userName: string;
  rowIndex: number;
  unitIndex: number;
};

type FinBill = {
  date: string;
  totalPaid: number | null;
  items: FinBillItem[];
  claims: FinClaim[];
};

type FinPayment = {
  paymentDate: string;
  userName: string;
  amount: number;
};

type CategoryCol = { items: string; amount: number };

type UserBillSnapshot = {
  food: CategoryCol;
  extras: CategoryCol;
  drinks: CategoryCol;
  total: number;
  dueWithTip: number;
  carryForward: number;
  paid: number;
  owed: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function exportCategory(cat: string): "food" | "fries" | "drinks" {
  const c = (cat || "").toLowerCase();
  if (c.includes("food")) return "food";
  if (c.includes("fries")) return "fries";
  return "drinks";
}

/** e.g. count=4, "Pt Coors" -> "4 Pt Coors" */
function formatDrinkLabel(count: number, description: string): string {
  const name = String(description || "").trim();
  return count + " " + name;
}

function resolveCanonicalName(name: string, configNames: string[]): string {
  const trimmed = String(name || "").trim();
  if (!trimmed) return trimmed;
  const norm = normalizeUserName(trimmed);
  for (const n of configNames) {
    if (normalizeUserName(n) === norm) return n;
  }
  return trimmed;
}

function analyzeBillForFinancial(bill: FinBill) {
  const claimMap: Record<string, string> = {};
  for (const c of bill.claims) {
    claimMap[`${c.rowIndex}_${c.unitIndex}`] = c.userName;
  }
  const byUser: Record<string, {
    food: { descs: string[]; amount: number };
    fries: { descs: string[]; amount: number };
    drinks: Record<string, { count: number; unitPrice: number }>;
    total: number;
  }> = {};

  for (const item of bill.items) {
    const qty = Number(item.quantity) || 0;
    const unitPrice = Number(item.unit_price) || 0;
    const exportCat = exportCategory(item.category);
    for (let u = 0; u < qty; u++) {
      const name = (claimMap[`${item.rowIndex}_${u}`] || "").trim();
      if (!name) continue;
      if (!byUser[name]) {
        byUser[name] = {
          food: { descs: [], amount: 0 },
          fries: { descs: [], amount: 0 },
          drinks: {},
          total: 0,
        };
      }
      byUser[name].total = roundMoney(byUser[name].total + unitPrice);
      if (exportCat === "food") {
        byUser[name].food.descs.push(item.description);
        byUser[name].food.amount = roundMoney(byUser[name].food.amount + unitPrice);
      } else if (exportCat === "fries") {
        byUser[name].fries.descs.push(item.description);
        byUser[name].fries.amount = roundMoney(byUser[name].fries.amount + unitPrice);
      } else {
        const key = item.description;
        if (!byUser[name].drinks[key]) {
          byUser[name].drinks[key] = { count: 0, unitPrice };
        }
        byUser[name].drinks[key].count++;
      }
    }
  }

  const billTotal = bill.items.reduce(
    (s, it) => s + (Number(it.total_price) || 0),
    0,
  );
  const totalPaid = bill.totalPaid != null ? Number(bill.totalPaid) : null;
  const tipAmount = (totalPaid != null && billTotal > 0 && totalPaid > billTotal)
    ? roundMoney(totalPaid - billTotal)
    : 0;

  const userRows: Record<string, {
    food: CategoryCol;
    extras: CategoryCol;
    drinks: CategoryCol;
    total: number;
    dueWithTip: number;
  }> = {};

  for (const userName of Object.keys(byUser)) {
    const data = byUser[userName];
    const drinkKeys = Object.keys(data.drinks);
    const drinkLabels: string[] = [];
    let drinkAmount = 0;
    for (const dk of drinkKeys) {
      const d = data.drinks[dk];
      drinkLabels.push(formatDrinkLabel(d.count, dk));
      drinkAmount = roundMoney(drinkAmount + d.unitPrice * d.count);
    }
    const userTotal = data.total;
    const share = billTotal > 0 ? userTotal / billTotal : 0;
    userRows[userName] = {
      food: { items: data.food.descs.join(", "), amount: data.food.amount },
      extras: { items: data.fries.descs.join(", "), amount: data.fries.amount },
      drinks: { items: drinkLabels.join(", "), amount: drinkAmount },
      total: userTotal,
      dueWithTip: roundMoney(userTotal + tipAmount * share),
    };
  }

  return { billTotal, tipAmount, totalPaid, userRows };
}

const FINANCIAL_GUEST_JOHN = "John";

function findJohnBillShare(
  analysis: ReturnType<typeof analyzeBillForFinancial>,
) {
  let share = analysis.userRows[FINANCIAL_GUEST_JOHN];
  if (!share) {
    for (const rawName of Object.keys(analysis.userRows)) {
      if (normalizeUserName(rawName) === normalizeUserName(FINANCIAL_GUEST_JOHN)) {
        share = analysis.userRows[rawName];
        break;
      }
    }
  }
  if (!share || share.total <= 0) return null;
  return share;
}

type OpeningBalanceUser = {
  userName: string;
  balance: number;
  displayOrder: number;
};

type OpeningBalancesConfig = {
  asOfDate: string;
  billStartDate: string;
  users: OpeningBalanceUser[];
};

function resolveFinancialName(
  name: string,
  financialNames: string[],
): string | null {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  const norm = normalizeUserName(trimmed);
  for (const n of financialNames) {
    if (normalizeUserName(n) === norm) return n;
  }
  return null;
}

function billStartDateFromAsOf(asOfDate: string): string {
  const d = new Date(asOfDate + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return formatDate(d) as string;
}

function buildFinancialLedger(
  bills: FinBill[],
  payments: FinPayment[],
  opening: OpeningBalancesConfig,
) {
  const financialNames = opening.users
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((u) => u.userName);

  const nameSet: Record<string, boolean> = {};
  const balances: Record<string, number> = {};
  for (const u of opening.users) {
    nameSet[u.userName] = true;
    balances[u.userName] = roundMoney(u.balance);
  }

  const settled = bills
    .filter((b) =>
      b.totalPaid != null && b.date.localeCompare(opening.billStartDate) >= 0
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const billSnapshots: Record<string, Record<string, UserBillSnapshot>> = {};
  const billsByDate: Record<string, FinBill> = {};
  for (const b of settled) billsByDate[b.date] = b;

  const paymentsByDate: Record<string, FinPayment[]> = {};
  for (const p of payments) {
    const canon = resolveFinancialName(p.userName, financialNames);
    if (!canon) continue;
    if (!paymentsByDate[p.paymentDate]) paymentsByDate[p.paymentDate] = [];
    paymentsByDate[p.paymentDate].push({ ...p, userName: canon });
  }

  const dateSet = new Set<string>();
  for (const b of settled) dateSet.add(b.date);
  for (const p of payments) {
    if (resolveFinancialName(p.userName, financialNames)) {
      dateSet.add(p.paymentDate);
    }
  }
  const dates = Array.from(dateSet).sort();

  const userLatestBillDue: Record<string, { date: string; due: number }> = {};
  const orderedNames = financialNames;

  for (const date of dates) {
    const bill = billsByDate[date];
    if (bill) {
      const analysis = analyzeBillForFinancial(bill);
      billSnapshots[bill.date] = {};

      for (const userName of orderedNames) {
        let share = analysis.userRows[userName];
        if (!share) {
          for (const rawName of Object.keys(analysis.userRows)) {
            if (resolveFinancialName(rawName, financialNames) === userName) {
              share = analysis.userRows[rawName];
              break;
            }
          }
        }
        const cf = roundMoney(balances[userName] || 0);
        const due = share ? share.dueWithTip : 0;
        if (due > 0) {
          userLatestBillDue[userName] = { date: bill.date, due };
        }
        balances[userName] = roundMoney(cf + due);
        billSnapshots[bill.date][userName] = {
          food: share ? share.food : { items: "", amount: 0 },
          extras: share ? share.extras : { items: "", amount: 0 },
          drinks: share ? share.drinks : { items: "", amount: 0 },
          total: share ? share.total : 0,
          dueWithTip: due,
          carryForward: cf,
          paid: 0,
          owed: 0,
        };
      }
    }

    const dayPayments = paymentsByDate[date] || [];
    for (const p of dayPayments) {
      const name = p.userName;
      balances[name] = roundMoney((balances[name] || 0) - p.amount);
      if (bill && billSnapshots[bill.date] && billSnapshots[bill.date][name]) {
        billSnapshots[bill.date][name].paid = roundMoney(
          billSnapshots[bill.date][name].paid + p.amount,
        );
      }
    }

    if (bill && billSnapshots[bill.date]) {
      for (const userName of orderedNames) {
        billSnapshots[bill.date][userName].owed = roundMoney(
          balances[userName] || 0,
        );
      }
    }
  }

  const latestBill = settled.length ? settled[settled.length - 1] : null;
  return {
    balances,
    orderedNames,
    billSnapshots,
    latestBill,
    userLatestBillDue,
    opening,
  };
}

async function loadFinancialBills(sb: ReturnType<typeof createClient>): Promise<FinBill[]> {
  const full = await getAllBillsFull(sb);
  const { data: metaData, error: metaErr } = await sb.from("bills").select(
    "bill_date, total_paid",
  );
  if (metaErr) throw new Error(metaErr.message);
  const paidByDate: Record<string, number | null> = {};
  for (const row of metaData || []) {
    const d = formatDate((row as { bill_date: string }).bill_date);
    if (!d) continue;
    const tp = (row as { total_paid: number | null }).total_paid;
    paidByDate[d] = tp != null ? Number(tp) : null;
  }
  return (full.bills || []).map((b: Record<string, unknown>) => ({
    date: String(b.date),
    totalPaid: paidByDate[String(b.date)] ?? null,
    items: (b.items as FinBillItem[]) || [],
    claims: ((b.claims as Array<Record<string, unknown>>) || []).map((c) => ({
      userName: String(c.userName || ""),
      rowIndex: Number(c.rowIndex) || 0,
      unitIndex: Number(c.unitIndex) || 0,
    })),
  }));
}

async function loadOpeningBalances(
  sb: ReturnType<typeof createClient>,
): Promise<OpeningBalancesConfig> {
  const { data, error } = await sb.from("opening_balances").select(
    "user_name, as_of_date, balance, display_order",
  ).order("display_order", { ascending: true });
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Opening balances not configured");
  }
  const asOfDate = formatDate(
    (data[0] as { as_of_date: string }).as_of_date,
  ) as string;
  return {
    asOfDate,
    billStartDate: billStartDateFromAsOf(asOfDate),
    users: (data as Array<{
      user_name: string;
      balance: number;
      display_order: number;
    }>).map((r) => ({
      userName: String(r.user_name || "").trim(),
      balance: roundMoney(Number(r.balance) || 0),
      displayOrder: Number(r.display_order) || 0,
    })),
  };
}

async function loadPayments(sb: ReturnType<typeof createClient>): Promise<FinPayment[]> {
  const { data, error } = await sb.from("payments").select(
    "payment_date, user_name, amount",
  ).order("payment_date", { ascending: true }).order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r: { payment_date: string; user_name: string; amount: number }) => ({
    paymentDate: formatDate(r.payment_date) as string,
    userName: String(r.user_name || "").trim(),
    amount: roundMoney(Number(r.amount) || 0),
  })).filter((p: FinPayment) => !!p.paymentDate && p.userName && p.amount > 0);
}

async function getFinancialOverview(sb: ReturnType<typeof createClient>) {
  const [bills, payments, opening] = await Promise.all([
    loadFinancialBills(sb),
    loadPayments(sb),
    loadOpeningBalances(sb),
  ]);
  const ledger = buildFinancialLedger(bills, payments, opening);
  const latestBill = ledger.latestBill;
  if (!latestBill) {
    return {
      billDate: null,
      openingAsOf: opening.asOfDate,
      rows: opening.users
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((u) => ({
          userName: u.userName,
          food: { items: "", amount: 0 },
          extras: { items: "", amount: 0 },
          drinks: { items: "", amount: 0 },
          total: 0,
          dueWithTip: 0,
          carryForward: u.balance,
          paid: 0,
          owed: u.balance,
        })),
      footer: null,
      balances: ledger.orderedNames.map((n) => ({
        userName: n,
        balance: roundMoney(ledger.balances[n] || 0),
      })),
    };
  }

  const analysis = analyzeBillForFinancial(latestBill);
  const snapshots = ledger.billSnapshots[latestBill.date] || {};
  const rows = ledger.orderedNames.map((userName) => {
    const snap = snapshots[userName] || {
      food: { items: "", amount: 0 },
      extras: { items: "", amount: 0 },
      drinks: { items: "", amount: 0 },
      total: 0,
      dueWithTip: 0,
      carryForward: roundMoney(ledger.balances[userName] || 0),
      paid: 0,
      owed: roundMoney(ledger.balances[userName] || 0),
    };
    return {
      userName,
      food: snap.food,
      extras: snap.extras,
      drinks: snap.drinks,
      total: snap.total,
      dueWithTip: snap.dueWithTip,
      carryForward: snap.carryForward,
      paid: snap.paid,
      owed: snap.owed,
    };
  });

  const johnShare = findJohnBillShare(analysis);
  if (johnShare) {
    rows.unshift({
      userName: FINANCIAL_GUEST_JOHN,
      food: johnShare.food,
      extras: johnShare.extras,
      drinks: johnShare.drinks,
      total: johnShare.total,
      dueWithTip: johnShare.dueWithTip,
      carryForward: null,
      paid: null,
      owed: null,
      guestRow: true,
    });
  }

  let footerFood = 0;
  let footerExtras = 0;
  let footerDrinks = 0;
  let footerCf = 0;
  let footerPaid = 0;
  let footerOwed = 0;
  let footerDue = 0;
  for (const row of rows) {
    footerFood = roundMoney(footerFood + row.food.amount);
    footerExtras = roundMoney(footerExtras + row.extras.amount);
    footerDrinks = roundMoney(footerDrinks + row.drinks.amount);
    if (row.carryForward != null) {
      footerCf = roundMoney(footerCf + row.carryForward);
    }
    if (row.paid != null) {
      footerPaid = roundMoney(footerPaid + row.paid);
    }
    if (row.owed != null) {
      footerOwed = roundMoney(footerOwed + row.owed);
    }
    footerDue = roundMoney(footerDue + row.dueWithTip);
  }

  const tipRate = analysis.billTotal > 0
    ? roundMoney((analysis.tipAmount / analysis.billTotal) * 100) / 100
    : 0;

  return {
    billDate: latestBill.date,
    rows,
    footer: {
      foodTotal: footerFood,
      extrasTotal: footerExtras,
      drinksTotal: footerDrinks,
      billTotal: analysis.billTotal,
      totalDueWithTip: footerDue,
      carryForwardTotal: footerCf,
      paidTotal: footerPaid,
      owedTotal: footerOwed,
      paidByJP: analysis.totalPaid,
      tipRate,
      tipAmount: analysis.tipAmount,
    },
    balances: ledger.orderedNames.map((n) => ({
      userName: n,
      balance: roundMoney(ledger.balances[n] || 0),
    })),
  };
}

async function getUserBalanceInfo(sb: ReturnType<typeof createClient>) {
  const [bills, payments, opening] = await Promise.all([
    loadFinancialBills(sb),
    loadPayments(sb),
    loadOpeningBalances(sb),
  ]);
  const ledger = buildFinancialLedger(bills, payments, opening);
  return {
    users: ledger.orderedNames.map((userName) => ({
      userName,
      balance: roundMoney(ledger.balances[userName] || 0),
      latestBillDue: ledger.userLatestBillDue[userName]
        ? ledger.userLatestBillDue[userName].due
        : 0,
      latestBillDate: ledger.userLatestBillDue[userName]
        ? ledger.userLatestBillDue[userName].date
        : null,
    })),
  };
}

async function getUserStatement(
  sb: ReturnType<typeof createClient>,
  userName: string,
) {
  const rawName = String(userName || "").trim();
  if (!rawName) throw new Error("Missing userName");
  const [bills, payments, opening] = await Promise.all([
    loadFinancialBills(sb),
    loadPayments(sb),
    loadOpeningBalances(sb),
  ]);
  const financialNames = opening.users.map((u) => u.userName);
  const canon = resolveFinancialName(rawName, financialNames);
  if (!canon) {
    throw new Error("No financial account for this name");
  }
  const ledger = buildFinancialLedger(bills, payments, opening);
  const settled = bills
    .filter((b) =>
      b.totalPaid != null && b.date.localeCompare(opening.billStartDate) >= 0
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const openingUser = opening.users.find((u) => u.userName === canon);
  const openingBalance = openingUser ? openingUser.balance : 0;

  const paymentsByDate: Record<string, FinPayment[]> = {};
  for (const p of payments) {
    const pCanon = resolveFinancialName(p.userName, financialNames);
    if (pCanon !== canon) continue;
    if (!paymentsByDate[p.paymentDate]) paymentsByDate[p.paymentDate] = [];
    paymentsByDate[p.paymentDate].push(p);
  }

  const events: Array<{
    date: string;
    type: "opening" | "bill" | "payment";
    description: string;
    amount: number | null;
    billDate: string | null;
    balanceAfter: number;
  }> = [];

  const dateSet = new Set<string>();
  for (const b of settled) dateSet.add(b.date);
  for (const p of payments) {
    if (resolveFinancialName(p.userName, financialNames) === canon) {
      dateSet.add(p.paymentDate);
    }
  }
  const dates = Array.from(dateSet).sort();

  let balance = roundMoney(openingBalance);
  for (const date of dates) {
    const bill = settled.find((b) => b.date === date);
    if (bill) {
      const analysis = analyzeBillForFinancial(bill);
      const share = analysis.userRows[canon] ||
        Object.entries(analysis.userRows).find(([n]) =>
          resolveFinancialName(n, financialNames) === canon
        )?.[1];
      const due = share ? share.dueWithTip : 0;
      if (due > 0) {
        balance = roundMoney(balance + due);
        events.push({
          date,
          type: "bill",
          description: "Bill",
          amount: due,
          billDate: date,
          balanceAfter: balance,
        });
      }
    }
    const dayPayments = paymentsByDate[date] || [];
    for (const p of dayPayments) {
      balance = roundMoney(balance - p.amount);
      events.push({
        date,
        type: "payment",
        description: "Payment",
        amount: -p.amount,
        billDate: null,
        balanceAfter: balance,
      });
    }
  }

  events.push({
    date: opening.asOfDate,
    type: "opening",
    description: "Opening balance",
    amount: null,
    billDate: null,
    balanceAfter: roundMoney(openingBalance),
  });

  events.reverse();
  return {
    userName: canon,
    currentBalance: roundMoney(ledger.balances[canon] || 0),
    openingAsOf: opening.asOfDate,
    transactions: events,
  };
}

async function getAllTransactions(sb: ReturnType<typeof createClient>) {
  const [bills, payments, opening] = await Promise.all([
    loadFinancialBills(sb),
    loadPayments(sb),
    loadOpeningBalances(sb),
  ]);
  const financialNames = opening.users.map((u) => u.userName);

  const orderIndex: Record<string, number> = {};
  for (const u of opening.users) {
    orderIndex[u.userName] = u.displayOrder;
  }

  const transactions: Array<{
    date: string;
    type: "opening" | "bill" | "payment";
    description: string;
    amount: number;
    billDate: string | null;
    userName: string | null;
  }> = [];

  for (const u of opening.users) {
    transactions.push({
      date: opening.asOfDate,
      type: "opening",
      description: u.userName + " - Opening balance",
      amount: roundMoney(u.balance),
      billDate: null,
      userName: u.userName,
    });
  }

  const settled = bills
    .filter((b) =>
      b.totalPaid != null && b.date.localeCompare(opening.billStartDate) >= 0
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const bill of settled) {
    const analysis = analyzeBillForFinancial(bill);
    for (const userName of financialNames) {
      let share = analysis.userRows[userName];
      if (!share) {
        for (const rawName of Object.keys(analysis.userRows)) {
          if (resolveFinancialName(rawName, financialNames) === userName) {
            share = analysis.userRows[rawName];
            break;
          }
        }
      }
      const due = share ? share.dueWithTip : 0;
      if (due <= 0) continue;
      transactions.push({
        date: bill.date,
        type: "bill",
        description: userName + " - Bill",
        amount: roundMoney(due),
        billDate: bill.date,
        userName,
      });
    }
  }

  for (const p of payments) {
    const canon = resolveFinancialName(p.userName, financialNames);
    if (!canon) continue;
    transactions.push({
      date: p.paymentDate,
      type: "payment",
      description: canon + " - Payment",
      amount: roundMoney(p.amount),
      billDate: null,
      userName: canon,
    });
  }

  const typeOrder: Record<string, number> = {
    payment: 0,
    bill: 1,
    opening: 2,
  };

  transactions.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    const ta = typeOrder[a.type] ?? 9;
    const tb = typeOrder[b.type] ?? 9;
    if (ta !== tb) return ta - tb;
    const ao = orderIndex[a.userName || ""] || 0;
    const bo = orderIndex[b.userName || ""] || 0;
    return ao - bo;
  });

  return { transactions };
}

async function recordPayment(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const paymentDate = formatDate(body.paymentDate);
  const userName = String(body.userName || "").trim();
  const amount = Number(body.amount);
  if (!paymentDate || !userName) throw new Error("Missing paymentDate or userName");
  if (isNaN(amount) || amount <= 0) throw new Error("Invalid amount");
  const opening = await loadOpeningBalances(sb);
  const financialNames = opening.users.map((u) => u.userName);
  const canon = resolveFinancialName(userName, financialNames);
  if (!canon) throw new Error("No financial account for this name");
  const { error } = await sb.from("payments").insert({
    payment_date: paymentDate,
    user_name: canon,
    amount: roundMoney(amount),
  });
  if (error) throw new Error(error.message);
  return {
    ok: true,
    paymentDate,
    userName: canon,
    amount: roundMoney(amount),
  };
}

async function doGet(sb: ReturnType<typeof createClient>, url: URL) {
  const action = url.searchParams.get("action") || "";
  const out: { error: string | null; data: unknown } = { error: null, data: null };
  try {
    if (action === "dates") out.data = await getDatesWithBills(sb);
    else if (action === "bill") out.data = await getBillForDate(sb, url.searchParams.get("date") || "");
    else if (action === "claims") out.data = await getClaimsForDate(sb, url.searchParams.get("date") || "");
    else if (action === "config") out.data = await getConfigNames(sb);
    else if (action === "productIcons") out.data = await getProductIcons(sb);
    else if (action === "getBillImage") out.data = await getBillImage(sb, url.searchParams.get("date") || "");
    else if (action === "getAllBillsFull") out.data = await getAllBillsFull(sb);
    else if (action === "getBillsSummary") out.data = await getBillsSummary(sb);
    else if (action === "getBillFull") out.data = await getBillFull(sb, url.searchParams.get("date") || "");
    else if (action === "getFinancialOverview") out.data = await getFinancialOverview(sb);
    else if (action === "getUserBalanceInfo") out.data = await getUserBalanceInfo(sb);
    else if (action === "getAllTransactions") out.data = await getAllTransactions(sb);
    else if (action === "getUserStatement") {
      out.data = await getUserStatement(sb, url.searchParams.get("userName") || "");
    } else throw new Error("Unknown or missing action");
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  }
  return responseJson(out);
}

async function doPost(sb: ReturnType<typeof createClient>, req: Request) {
  let body: Record<string, unknown> = {};
  try {
    const txt = await req.text();
    if (txt) body = JSON.parse(txt);
  } catch {
    body = {};
  }
  const action = String(body.action || "");
  const out: { error: string | null; data: unknown } = { error: null, data: null };
  try {
    if (action === "submitClaims") out.data = await submitClaims(sb, body);
    else if (action === "analyzeBillImage") out.data = await analyzeBillImage(sb, body);
    else if (action === "completeBillUpload") out.data = await completeBillUpload(sb, body);
    else if (action === "updateBillTotalPaid") out.data = await updateBillTotalPaid(sb, body);
    else if (action === "deleteBill") out.data = await deleteBill(sb, body);
    else if (action === "setBillOpen") out.data = await setBillOpen(sb, body);
    else if (action === "recordPayment") out.data = await recordPayment(sb, body);
    else throw new Error("Unknown or missing action");
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  }
  return responseJson(out);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    return responseJson({ error: "Missing Supabase environment variables", data: null }, 500);
  }
  const sb = createClient(supabaseUrl, serviceKey, { db: { schema: SCHEMA } });
  if (req.method === "GET") return doGet(sb, new URL(req.url));
  if (req.method === "POST") return doPost(sb, req);
  return responseJson({ error: "Method not allowed", data: null }, 405);
});
