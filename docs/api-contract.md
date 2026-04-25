# theConfessional API Contract (Frozen for Supabase Parity)

This contract is extracted from `backend/code.gs` and `assets/js/utils/api.js`.
The Supabase Edge Function must keep these action names and response shapes:

- GET `action=dates` -> `[{ date: "YYYY-MM-DD", open: boolean }]`
- GET `action=bill&date=YYYY-MM-DD` -> `{ items: BillItem[], metadata: { billImageUrl: string|null, totalPaid: number|null } }`
- GET `action=claims&date=YYYY-MM-DD` -> `Claim[]`
- GET `action=config` -> `string[]`
- GET `action=productIcons` -> `[{ product: string, image: string }]`
- GET `action=getBillImage&date=YYYY-MM-DD` -> `{ mimeType: string, base64: string }`
- GET `action=getAllBillsFull` -> `{ bills: [{ date, open, inFlight, items: BillItem[], claims: Claim[] }] }`
- GET `action=getBillsSummary` -> `{ bills: [{ date, open, inFlight, hasClaims, allClaimed }] }`
- GET `action=getBillFull&date=YYYY-MM-DD` -> `{ date, open, inFlight, totalPaid, items, claims }`

- POST `action=submitClaims` payload `{ date, userName, claims: [{ rowIndex, unitIndex }] }`
  -> `{ ok: true, count: number, claims: Claim[] }`
- POST `action=analyzeBillImage` payload `{ base64, mimeType, geminiModel? }`
  -> `{ jobId, date, billTotal }`
- POST `action=completeBillUpload` payload `{ jobId, base64, mimeType, paidAmount? }`
  -> `{ date, billTotal, tipAmount, totalPaid }`
- POST `action=updateBillTotalPaid` payload `{ date, totalPaid }`
  -> `{ date, billTotal, tipAmount, totalPaid }`
- POST `action=deleteBill` payload `{ date }` -> `{ ok: true }`
- POST `action=setBillOpen` payload `{ date, open }` -> `{ ok: true, open }`

All responses must keep envelope: `{ error: string|null, data: unknown }`.

Types:
- `BillItem` = `{ rowIndex, category, description, quantity, unit_price, total_price }`
- `Claim` = `{ date, userName, rowIndex, unitIndex }`
