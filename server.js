const express = require("express");
const path = require("path");
const fs = require("fs");
const { createHash, randomUUID } = require("crypto");

loadEnv(path.join(process.cwd(), ".env"));

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "127.0.0.1";
const BRAIN_SERVICE_URL = process.env.BRAIN_SERVICE_URL || "http://127.0.0.1:8000";
const ROOT_DIR = process.cwd();
const QDRANT_URL = safeString(process.env.QDRANT_URL).replace(/\/+$/, "");
const QDRANT_API_KEY = safeString(process.env.QDRANT_API_KEY);
const QDRANT_CA_COLLECTION = safeString(process.env.QDRANT_CA_COLLECTION) || "complisure_ca_tasks";
const RESEND_API_KEY = safeString(process.env.RESEND_API_KEY);
const RESEND_FROM_EMAIL = safeString(process.env.RESEND_FROM_EMAIL) || "CompliSure <onboarding@resend.dev>";
const RESEND_BASE_URL = (safeString(process.env.RESEND_BASE_URL) || "https://api.resend.com").replace(/\/+$/, "");
const REMINDER_ALLOW_DRY_RUN = safeString(process.env.REMINDER_ALLOW_DRY_RUN).toLowerCase() === "true";
const APP_BASE_URL = safeString(process.env.APP_BASE_URL) || `http://${HOST}:${PORT}`;
const STORAGE_DIR = path.join(ROOT_DIR, "storage");
const BILL_LEDGER_PATH = path.join(STORAGE_DIR, "bill-workspace.json");
const BILL_SCAN_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);
const CA_VECTOR_SIZE = 8;

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const REMINDER_SCHEDULE = {
  "30_days_before": {
    label: "30 days before due date",
    offsetDaysFromDue: -30,
    recipientMode: "owner_ca",
    channels: ["whatsapp", "email"],
    actionInMessage: "View deadline details",
    sendsEmail: true
  },
  "7_days_before": {
    label: "7 days before due date",
    offsetDaysFromDue: -7,
    recipientMode: "owner_ca",
    channels: ["whatsapp", "email"],
    actionInMessage: "View deadline details",
    sendsEmail: true
  },
  "3_days_before": {
    label: "3 days before due date",
    offsetDaysFromDue: -3,
    recipientMode: "owner_ca",
    channels: ["whatsapp", "push"],
    actionInMessage: "Mark as filed / Escalate",
    sendsEmail: false
  },
  due_date: {
    label: "Due date (Day 0)",
    offsetDaysFromDue: 0,
    recipientMode: "owner_ca",
    channels: ["whatsapp", "push", "email"],
    actionInMessage: "Mark as filed",
    sendsEmail: true
  },
  "1_day_after_due": {
    label: "1 day after due date",
    offsetDaysFromDue: 1,
    recipientMode: "owner_only",
    channels: ["whatsapp", "push"],
    actionInMessage: "See penalty calculator",
    sendsEmail: false
  },
  event_new_obligation: {
    label: "Event triggered (new obligation)",
    offsetDaysFromDue: null,
    recipientMode: "owner_ca",
    channels: ["whatsapp", "push"],
    actionInMessage: "View new obligation",
    sendsEmail: false
  }
};

const reminderStatusByObligation = new Map();
const reminderDispatchHistory = new Set();
const DEFAULT_CA_ROWS = [
  { client: "Zephyr Tech Pvt Ltd", filing: "GSTR-3B - April", dept: "GST", due: "2026-04-20", status: "overdue" },
  { client: "Novacraft LLP", filing: "TDS Return Q4", dept: "Income Tax", due: "2026-04-30", status: "inprogress" },
  { client: "Merkle Biotech Pvt Ltd", filing: "PF Challan - March", dept: "Labour", due: "2026-04-15", status: "overdue" },
  { client: "Stackline Pvt Ltd", filing: "DIR-3 KYC", dept: "MCA", due: "2026-04-30", status: "pending" },
  { client: "Zephyr Tech Pvt Ltd", filing: "GSTR-1 - April", dept: "GST", due: "2026-04-11", status: "filed" }
];

app.use(express.json({ limit: "25mb" }));
app.use(express.static(ROOT_DIR));

app.get("/api/aadhaar/status", async (_req, res) => {
  try {
    const response = await fetch(`${BRAIN_SERVICE_URL}/health`);
    const data = await response.json();
    res.status(200).json({
      configured: Boolean(data.configured),
      brainReachable: true
    });
  } catch {
    res.status(200).json({
      configured: false,
      brainReachable: false
    });
  }
});

app.post("/api/aadhaar/otp", async (req, res) => {
  const aadhaar = normalizeDigits(req.body?.aadhaar);

  if (!aadhaar || aadhaar.length !== 12) {
    res.status(400).json({ error: "Valid 12-digit Aadhaar number is required." });
    return;
  }

  if (!req.body?.consent) {
    res.status(400).json({ error: "Consent is required before OTP can be requested." });
    return;
  }

  try {
    const response = await fetch(`${BRAIN_SERVICE_URL}/aadhaar/otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        aadhaar,
        consent: Boolean(req.body?.consent),
        full_name: safeString(req.body?.fullName),
        company_name: safeString(req.body?.companyName)
      })
    });

    const payload = await readJsonResponse(response);
    res.status(response.status).json(payload);
  } catch (error) {
    console.error("OTP proxy error:", error);
    res.status(502).json({ error: "Could not reach Aadhaar verification service." });
  }
});

app.post("/api/aadhaar/verify", async (req, res) => {
  const aadhaar = normalizeDigits(req.body?.aadhaar);
  const otp = normalizeDigits(req.body?.otp);
  const referenceId = safeString(req.body?.referenceId);

  if (!aadhaar || aadhaar.length !== 12) {
    res.status(400).json({ error: "Valid 12-digit Aadhaar number is required." });
    return;
  }

  if (!otp || otp.length < 4) {
    res.status(400).json({ error: "Valid OTP is required." });
    return;
  }

  if (!referenceId) {
    res.status(400).json({ error: "Missing Aadhaar reference ID." });
    return;
  }

  try {
    const response = await fetch(`${BRAIN_SERVICE_URL}/aadhaar/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        aadhaar,
        otp,
        reference_id: referenceId,
        consent: Boolean(req.body?.consent),
        full_name: safeString(req.body?.fullName),
        company_name: safeString(req.body?.companyName)
      })
    });

    const payload = await readJsonResponse(response);
    res.status(response.status).json(payload);
  } catch (error) {
    console.error("Verify proxy error:", error);
    res.status(502).json({ error: "Could not reach Aadhaar verification service." });
  }
});

app.get("/api/bills", (_req, res) => {
  res.status(200).json({
    success: true,
    workspace: readBillWorkspace()
  });
});

app.post("/api/bills/scan", async (req, res) => {
  const fileName = safeString(req.body?.fileName);
  const mimeType = safeString(req.body?.mimeType).toLowerCase();
  const fileBase64 = safeString(req.body?.fileBase64);

  if (!fileName) {
    res.status(400).json({ error: "Uploaded bill file name is required." });
    return;
  }

  if (!BILL_SCAN_ALLOWED_MIME_TYPES.has(mimeType)) {
    res.status(400).json({ error: "Only PDF, JPG, PNG, WEBP, HEIC, and HEIF bills are supported." });
    return;
  }

  if (!fileBase64) {
    res.status(400).json({ error: "Uploaded bill content is missing." });
    return;
  }

  try {
    const response = await fetch(`${BRAIN_SERVICE_URL}/bills/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        file_name: fileName,
        mime_type: mimeType,
        image_base64: fileBase64
      })
    });

    const payload = await readJsonResponse(response);
    if (!response.ok) {
      res.status(response.status).json(payload);
      return;
    }

    const document = buildStoredBillDocument(payload.document);
    const transactions = buildTransactionsFromDocument(document);
    const workspace = readBillWorkspace();
    workspace.documents = [document, ...workspace.documents];
    workspace.transactions = [...transactions, ...workspace.transactions];
    writeBillWorkspace(workspace);

    res.status(200).json({
      success: true,
      message: payload.message || `${document.fileName} scanned and stored in the ledger.`,
      document,
      transactions,
      workspace
    });
  } catch (error) {
    console.error("Bill scan proxy error:", error);
    res.status(502).json({ error: "Could not reach bill scanning service." });
  }
});

app.post("/api/notices/interpret", async (req, res) => {
  const text = safeString(req.body?.text);
  const fileName = safeString(req.body?.fileName);
  const mimeType = safeString(req.body?.mimeType).toLowerCase();
  const fileBase64 = safeString(req.body?.fileBase64);

  if (!text && !fileBase64) {
    res.status(400).json({ error: "Provide notice text or upload a PDF/image notice." });
    return;
  }

  if (fileBase64 && !fileName) {
    res.status(400).json({ error: "Uploaded notice file name is required." });
    return;
  }

  if (fileBase64 && !BILL_SCAN_ALLOWED_MIME_TYPES.has(mimeType)) {
    res.status(400).json({ error: "Only PDF, JPG, PNG, WEBP, HEIC, and HEIF notice files are supported." });
    return;
  }

  try {
    const response = await fetch(`${BRAIN_SERVICE_URL}/notices/interpret`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        file_name: fileName,
        mime_type: mimeType,
        file_base64: fileBase64,
        company_name: safeString(req.body?.companyName),
        founder_name: safeString(req.body?.founderName)
      })
    });

    const payload = await readJsonResponse(response);
    res.status(response.status).json(payload);
  } catch (error) {
    console.error("Notice interpret proxy error:", error);
    res.status(502).json({ error: "Could not reach notice interpretation service." });
  }
});

app.post("/api/notices/chat", async (req, res) => {
  try {
    const response = await fetch(`${BRAIN_SERVICE_URL}/notices/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question: safeString(req.body?.question),
        interpretation: req.body?.interpretation || {},
        history: Array.isArray(req.body?.history) ? req.body.history : [],
        source_text: safeString(req.body?.sourceText),
        company_name: safeString(req.body?.companyName),
        founder_name: safeString(req.body?.founderName)
      })
    });

    const payload = await readJsonResponse(response);
    res.status(response.status).json(payload);
  } catch (error) {
    console.error("Notice chat proxy error:", error);
    res.status(502).json({ error: "Could not reach notice follow-up service." });
  }
});

app.get("/api/ca/rows", async (req, res) => {
  try {
    const workspaceKey = buildCaWorkspaceKey({
      companyName: safeString(req.query?.companyName),
      fullName: safeString(req.query?.fullName)
    });

    const rows = await readCaRows(workspaceKey);
    if (rows.length) {
      res.status(200).json({ success: true, rows });
      return;
    }

    const seeded = await seedDefaultCaRows(workspaceKey);
    res.status(200).json({
      success: true,
      rows: seeded,
      message: "Seeded the CA portal with starter client filings."
    });
  } catch (error) {
    console.error("CA rows load error:", error);
    res.status(502).json({ error: error.message || "Could not load CA portal rows from Qdrant." });
  }
});

app.post("/api/ca/rows/upsert", async (req, res) => {
  try {
    const workspaceKey = buildCaWorkspaceKey({
      companyName: safeString(req.body?.companyName),
      fullName: safeString(req.body?.fullName)
    });
    const row = normalizeCaRow(req.body?.row);
    if (!row.client || !row.filing || !row.dept || !row.dueDate) {
      res.status(400).json({ error: "Client, filing, department, and due date are required." });
      return;
    }

    const point = buildCaPoint(row, workspaceKey);
    await ensureCaCollection();
    await qdrantRequest("PUT", `/collections/${encodeURIComponent(QDRANT_CA_COLLECTION)}/points?wait=true`, {
      points: [point]
    });

    const rows = await readCaRows(workspaceKey);
    res.status(200).json({
      success: true,
      rows,
      row: rows.find((item) => item.id === point.id) || caRowFromPayload(point.payload, point.id),
      message: row.id ? "CA portal filing updated." : "New CA filing added."
    });
  } catch (error) {
    console.error("CA row upsert error:", error);
    res.status(502).json({ error: error.message || "Could not save the CA portal filing." });
  }
});

app.post("/api/ca/rows/mark-all-filed", async (req, res) => {
  try {
    const workspaceKey = buildCaWorkspaceKey({
      companyName: safeString(req.body?.companyName),
      fullName: safeString(req.body?.fullName)
    });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows.map(normalizeCaRow) : [];
    if (!rows.length) {
      res.status(400).json({ error: "No CA portal rows were provided." });
      return;
    }

    await ensureCaCollection();
    const points = rows.map((row) => buildCaPoint({
      ...row,
      status: "filed"
    }, workspaceKey));

    await qdrantRequest("PUT", `/collections/${encodeURIComponent(QDRANT_CA_COLLECTION)}/points?wait=true`, {
      points
    });

    const refreshedRows = await readCaRows(workspaceKey);
    res.status(200).json({
      success: true,
      rows: refreshedRows,
      message: "All CA portal filings were marked as filed."
    });
  } catch (error) {
    console.error("CA mark-all-filed error:", error);
    res.status(502).json({ error: error.message || "Could not update all CA portal rows." });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`CompliSure listening on http://${HOST}:${PORT}`);
  console.log(`Proxying Aadhaar requests to ${BRAIN_SERVICE_URL}`);
});

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function normalizeDigits(value) {
  return safeString(value).replace(/\D/g, "");
}

function readBillWorkspace() {
  try {
    if (!fs.existsSync(BILL_LEDGER_PATH)) {
      return createEmptyBillWorkspace();
    }

    const raw = fs.readFileSync(BILL_LEDGER_PATH, "utf8");
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : []
    };
  } catch (error) {
    console.error("Could not read bill workspace:", error);
    return createEmptyBillWorkspace();
  }
}

function writeBillWorkspace(workspace) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  fs.writeFileSync(BILL_LEDGER_PATH, JSON.stringify({
    documents: Array.isArray(workspace.documents) ? workspace.documents : [],
    transactions: Array.isArray(workspace.transactions) ? workspace.transactions : []
  }, null, 2));
}

function createEmptyBillWorkspace() {
  return {
    documents: [],
    transactions: []
  };
}

function buildStoredBillDocument(document) {
  return {
    id: createId("bill"),
    scannedAt: new Date().toISOString(),
    fileName: safeString(document?.fileName) || "scanned-bill",
    mimeType: safeString(document?.mimeType) || "image/jpeg",
    documentType: safeString(document?.documentType) || "invoice",
    vendorName: safeString(document?.vendorName) || "Unknown vendor",
    invoiceNumber: safeString(document?.invoiceNumber),
    invoiceDate: safeString(document?.invoiceDate),
    dueDate: safeString(document?.dueDate),
    currency: safeString(document?.currency) || "INR",
    subtotal: toNumber(document?.subtotal),
    taxAmount: toNumber(document?.taxAmount),
    cgstAmount: toNumber(document?.cgstAmount),
    sgstAmount: toNumber(document?.sgstAmount),
    igstAmount: toNumber(document?.igstAmount),
    totalAmount: toNumber(document?.totalAmount),
    paymentMethod: safeString(document?.paymentMethod),
    gstin: safeString(document?.gstin),
    category: safeString(document?.category) || "General expense",
    notes: safeString(document?.notes),
    confidence: toNumber(document?.confidence),
    lineItems: Array.isArray(document?.lineItems) ? document.lineItems.map((item) => ({
      description: safeString(item?.description) || "Scanned item",
      quantity: toNumber(item?.quantity) || 1,
      unitPrice: toNumber(item?.unitPrice),
      amount: toNumber(item?.amount),
      taxRate: toNumber(item?.taxRate),
      taxAmount: toNumber(item?.taxAmount),
      category: safeString(item?.category) || safeString(document?.category) || "General expense"
    })) : []
  };
}

function buildTransactionsFromDocument(document) {
  const invoiceDate = document.invoiceDate || document.scannedAt.slice(0, 10);
  const items = document.lineItems.length ? document.lineItems : [{
    description: document.documentType || "Scanned expense",
    quantity: 1,
    unitPrice: document.totalAmount,
    amount: document.subtotal || document.totalAmount,
    taxRate: 0,
    taxAmount: document.taxAmount,
    category: document.category || "General expense"
  }];

  return items.map((item, index) => ({
    id: createId(`txn-${document.id}-${index}`),
    documentId: document.id,
    invoiceDate,
    vendorName: document.vendorName,
    invoiceNumber: document.invoiceNumber,
    description: safeString(item.description) || `Line item ${index + 1}`,
    category: safeString(item.category) || document.category || "General expense",
    quantity: toNumber(item.quantity) || 1,
    unitPrice: toNumber(item.unitPrice),
    baseAmount: toNumber(item.amount),
    taxAmount: toNumber(item.taxAmount),
    grossAmount: toNumber(item.amount) + toNumber(item.taxAmount),
    gstin: document.gstin || "",
    paymentMethod: document.paymentMethod || ""
  }));
}

function createId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function toNumber(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").replace(/₹/g, "").trim();
    return Number.parseFloat(cleaned) || 0;
  }
  return Number(value) || 0;
}

async function ensureCaCollection() {
  ensureQdrantConfigured();

  try {
    await qdrantRequest("GET", `/collections/${encodeURIComponent(QDRANT_CA_COLLECTION)}`);
    return;
  } catch (error) {
    if (error.statusCode && error.statusCode !== 404) {
      throw error;
    }
  }

  await qdrantRequest("PUT", `/collections/${encodeURIComponent(QDRANT_CA_COLLECTION)}`, {
    vectors: {
      size: CA_VECTOR_SIZE,
      distance: "Cosine"
    }
  });
}

async function readCaRows(workspaceKey) {
  await ensureCaCollection();

  const response = await qdrantRequest("POST", `/collections/${encodeURIComponent(QDRANT_CA_COLLECTION)}/points/scroll`, {
    limit: 200,
    with_payload: true,
    with_vector: false,
    filter: {
      must: [
        {
          key: "workspaceKey",
          match: {
            value: workspaceKey
          }
        }
      ]
    }
  });

  const points = Array.isArray(response?.result?.points) ? response.result.points : [];
  return points
    .map((point) => caRowFromPayload(point.payload, point.id))
    .sort(sortCaRows);
}

async function seedDefaultCaRows(workspaceKey) {
  await ensureCaCollection();

  const points = DEFAULT_CA_ROWS.map((row) => buildCaPoint(normalizeCaRow(row), workspaceKey));
  await qdrantRequest("PUT", `/collections/${encodeURIComponent(QDRANT_CA_COLLECTION)}/points?wait=true`, {
    points
  });

  return points
    .map((point) => caRowFromPayload(point.payload, point.id))
    .sort(sortCaRows);
}

function buildCaPoint(row, workspaceKey) {
  const normalized = normalizeCaRow(row);
  const id = normalized.id || createId("ca");
  const payload = {
    id,
    workspaceKey,
    client: normalized.client,
    filing: normalized.filing,
    dept: normalized.dept,
    dueDate: normalized.dueDate,
    dueLabel: formatDueLabel(normalized.dueDate),
    dueTone: inferDueTone(normalized.dueDate, normalized.status),
    status: normalized.status,
    createdAt: normalized.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return {
    id,
    payload,
    vector: buildDeterministicVector(`${workspaceKey}|${payload.client}|${payload.filing}|${payload.dept}|${payload.dueDate}|${payload.status}`)
  };
}

function caRowFromPayload(payload, id) {
  const normalized = payload || {};
  return {
    id: safeString(id || normalized.id),
    client: safeString(normalized.client),
    filing: safeString(normalized.filing),
    dept: safeString(normalized.dept),
    dueDate: safeString(normalized.dueDate),
    due: safeString(normalized.dueLabel || formatDueLabel(normalized.dueDate)),
    dueTone: safeString(normalized.dueTone || inferDueTone(normalized.dueDate, normalized.status)),
    status: normalizeCaStatus(normalized.status),
    createdAt: safeString(normalized.createdAt),
    updatedAt: safeString(normalized.updatedAt)
  };
}

function normalizeCaRow(row) {
  return {
    id: safeString(row?.id),
    client: safeString(row?.client).trim(),
    filing: safeString(row?.filing).trim(),
    dept: safeString(row?.dept).trim(),
    dueDate: normalizeIsoDate(safeString(row?.dueDate || row?.due).trim()),
    status: normalizeCaStatus(row?.status),
    createdAt: safeString(row?.createdAt)
  };
}

function normalizeCaStatus(value) {
  const status = safeString(value).trim().toLowerCase();
  return ["overdue", "inprogress", "pending", "filed"].includes(status) ? status : "pending";
}

function buildCaWorkspaceKey({ companyName, fullName }) {
  const parts = [companyName, fullName]
    .map((item) => slugify(item))
    .filter(Boolean);
  return parts.join("--") || "complisure-default-ca-workspace";
}

function slugify(value) {
  return safeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDueLabel(value) {
  const normalized = normalizeIsoDate(safeString(value));
  if (!normalized) return "Date not set";
  const date = new Date(`${normalized}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function inferDueTone(dueDate, status) {
  if (normalizeCaStatus(status) === "filed") {
    return "green";
  }

  const normalized = normalizeIsoDate(safeString(dueDate));
  if (!normalized) return "amber";

  const today = todayUtcDate();
  const due = parseIsoDate(normalized);
  if (!due) return "amber";

  const delta = daysBetweenUtc(today, due);
  if (delta < 0 || delta <= 3) return "red";
  if (delta <= 10) return "amber";
  return "green";
}

function sortCaRows(left, right) {
  const dueCompare = (left.dueDate || "").localeCompare(right.dueDate || "");
  if (dueCompare !== 0) return dueCompare;
  return (left.client || "").localeCompare(right.client || "");
}

function buildDeterministicVector(text) {
  const digest = createHash("sha256").update(text).digest();
  const vector = [];

  for (let index = 0; index < CA_VECTOR_SIZE; index += 1) {
    const raw = digest[index] / 255;
    vector.push(Number(((raw * 2) - 1).toFixed(6)));
  }

  return vector;
}

function normalizeIsoDate(value) {
  const raw = safeString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return [
    parsed.getUTCFullYear(),
    String(parsed.getUTCMonth() + 1).padStart(2, "0"),
    String(parsed.getUTCDate()).padStart(2, "0")
  ].join("-");
}

async function qdrantRequest(method, pathName, body) {
  ensureQdrantConfigured();

  let response;
  try {
    response = await fetch(`${QDRANT_URL}${pathName}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "api-key": QDRANT_API_KEY
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    const failure = new Error("Could not reach Qdrant Cloud. Check QDRANT_URL/network access.");
    failure.cause = error;
    throw failure;
  }

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const failure = new Error(payload?.status?.error || payload?.message || payload?.error || `Qdrant request failed with ${response.status}.`);
    failure.statusCode = response.status;
    throw failure;
  }

  return payload;
}

function ensureQdrantConfigured() {
  if (!QDRANT_URL || !QDRANT_API_KEY) {
    throw new Error("Qdrant Cloud is not configured. Add QDRANT_URL and QDRANT_API_KEY to .env.");
  }
}

function safeString(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeReminderPayload(value) {
  return {
    trigger: safeString(value?.trigger || "7_days_before"),
    obligationId: safeString(value?.obligationId),
    obligationName: safeString(value?.obligationName || value?.filing),
    dueDate: safeString(value?.dueDate),
    companyName: safeString(value?.companyName),
    ownerName: safeString(value?.ownerName),
    ownerEmail: normalizeEmail(value?.ownerEmail),
    caName: safeString(value?.caName),
    caEmail: normalizeEmail(value?.caEmail)
  };
}

async function dispatchReminder({ payload, scheduleEntry, source }) {
  const recipients = buildActionRecipients(payload, scheduleEntry.recipientMode);
  const recipientEmails = recipients.map((item) => item.email);
  const dueDateLabel = formatHumanDate(payload.dueDate) || "Not specified";
  const subject = `Reminder: ${payload.obligationName} (${scheduleEntry.label})`;
  const actionText = scheduleEntry.actionInMessage;
  const reminderDetailsUrl = `${APP_BASE_URL}/#tools`;
  const html = `
    <p>Hello,</p>
    <p><strong>${escapeHtml(payload.obligationName)}</strong> is coming up.</p>
    <p>Company: ${escapeHtml(payload.companyName || "CompliSure Account")}</p>
    <p>Due date: ${escapeHtml(dueDateLabel)}</p>
    <p>Trigger: ${escapeHtml(scheduleEntry.label)}</p>
    <p>Action in message: ${escapeHtml(actionText)}</p>
    <p><a href="${escapeHtml(reminderDetailsUrl)}">View deadline details</a></p>
  `;
  const text = [
    `Reminder: ${payload.obligationName}`,
    `Company: ${payload.companyName || "CompliSure Account"}`,
    `Due date: ${dueDateLabel}`,
    `Trigger: ${scheduleEntry.label}`,
    `Action in message: ${actionText}`,
    `View details: ${reminderDetailsUrl}`
  ].join("\n");

  const emailResults = [];
  if (scheduleEntry.sendsEmail) {
    if (!recipients.length) {
      throw new Error("This trigger requires owner/CA email addresses.");
    }
    if (scheduleEntry.recipientMode === "owner_ca" && recipients.length < 2) {
      throw new Error("Both ownerEmail and caEmail are required for this reminder trigger.");
    }

    for (const recipient of recipients) {
      const result = await sendResendEmail({
        to: recipient.email,
        subject,
        html,
        text
      });

      emailResults.push({
        role: recipient.role,
        email: recipient.email,
        id: result.id || "",
        dryRun: result.dryRun === true
      });
    }
  }

  return {
    source,
    trigger: payload.trigger,
    triggerLabel: scheduleEntry.label,
    channels: scheduleEntry.channels,
    actionInMessage: actionText,
    recipients: recipientEmails,
    emailResults
  };
}

async function sendActionEmails({ recipients, subject, html, text }) {
  if (!recipients.length) return [];
  const results = [];

  for (const recipient of recipients) {
    const result = await sendResendEmail({
      to: recipient.email,
      subject,
      html,
      text
    });

    results.push({
      role: recipient.role,
      email: recipient.email,
      id: result.id || "",
      dryRun: result.dryRun === true
    });
  }

  return results;
}

function buildActionRecipients(payload, mode) {
  const recipients = [];
  if (mode === "owner_ca" || mode === "owner_only") {
    if (isValidEmail(payload.ownerEmail)) {
      recipients.push({ role: "owner", email: payload.ownerEmail });
    }
  }
  if (mode === "owner_ca" || mode === "ca_only") {
    if (isValidEmail(payload.caEmail)) {
      recipients.push({ role: "ca", email: payload.caEmail });
    }
  }
  return recipients;
}

async function sendResendEmail({ to, subject, html, text }) {
  if (!isValidEmail(to)) {
    throw new Error(`Invalid email: ${to || "(empty)"}`);
  }

  if (!RESEND_API_KEY) {
    if (!REMINDER_ALLOW_DRY_RUN) {
      throw new Error("RESEND_API_KEY is missing. Add it to .env or enable REMINDER_ALLOW_DRY_RUN=true.");
    }
    return { id: `dry-run-${Date.now()}`, dryRun: true };
  }

  if (!isLikelyResendApiKey(RESEND_API_KEY)) {
    throw new Error("RESEND_API_KEY format looks invalid. Use a Resend API key that starts with 're_'.");
  }

  let response;
  try {
    response = await fetch(`${RESEND_BASE_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [to],
        subject,
        html,
        text
      })
    });
  } catch (error) {
    const code = safeString(error?.cause?.code || error?.code);
    const suffix = code ? ` (${code})` : "";
    throw new Error(`Could not reach Resend API${suffix}. Check internet/proxy/firewall settings and try again.`);
  }

  const responsePayload = await readJsonResponse(response);
  if (!response.ok) {
    const message = responsePayload?.message || responsePayload?.error || `Resend request failed with ${response.status}.`;
    throw new Error(message);
  }

  return {
    id: safeString(responsePayload?.id || responsePayload?.data?.id),
    dryRun: false
  };
}

function buildObligationKey(payload) {
  return `${payload.obligationId || payload.obligationName.toLowerCase()}::${payload.dueDate || "na"}`;
}

function parseIsoDate(value) {
  const raw = safeString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function daysBetweenUtc(fromDate, toDate) {
  return Math.round((toDate.getTime() - fromDate.getTime()) / MS_IN_DAY);
}

function todayUtcDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function formatIsoDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatHumanDate(value) {
  const date = parseIsoDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function normalizeEmail(value) {
  return safeString(value).trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function isLikelyResendApiKey(value) {
  const token = safeString(value).trim();
  return token.startsWith("re_") && token.length >= 12;
}

function escapeHtml(value) {
  return safeString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const source = fs.readFileSync(filePath, "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = line.slice(0, equalsIndex).trim();
    if (!key || process.env[key]) continue;
    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
