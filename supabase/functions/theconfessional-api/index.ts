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
    else throw new Error("Unknown or missing action");
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
