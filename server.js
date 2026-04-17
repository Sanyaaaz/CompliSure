const express = require("express");
const path = require("path");
const fs = require("fs");
const { createHash, randomUUID } = require("crypto");
const {
  wrapQdrantPayload,
  unwrapQdrantPayload,
  resolveQdrantCollection,
  billLedgerFilePath,
  encryptFilePayload,
  decryptFilePayload,
  isMultiTenantQdrant,
  isEncryptionEnabled
} = require("./server/tenantCrypto");

loadEnv(path.join(process.cwd(), ".env"));

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "127.0.0.1";
const BRAIN_SERVICE_URL = process.env.BRAIN_SERVICE_URL || "http://127.0.0.1:8000";
const ROOT_DIR = process.cwd();
const QDRANT_URL = safeString(process.env.QDRANT_URL).replace(/\/+$/, "");
const QDRANT_API_KEY = safeString(process.env.QDRANT_API_KEY);
const QDRANT_CA_COLLECTION = safeString(process.env.QDRANT_CA_COLLECTION) || "complisure_ca_tasks";
const QDRANT_ONBOARDING_COLLECTION = safeString(process.env.QDRANT_ONBOARDING_COLLECTION) || "complisure_onboarding_profiles";
const QDRANT_BUSINESS_CONTEXT_COLLECTION =
  safeString(process.env.QDRANT_BUSINESS_CONTEXT_COLLECTION) || "complisure_business_context";
const RESEND_API_KEY = safeString(process.env.RESEND_API_KEY);
const RESEND_FROM_EMAIL = safeString(process.env.RESEND_FROM_EMAIL) || "CompliSure <onboarding@resend.dev>";
const RESEND_BASE_URL = (safeString(process.env.RESEND_BASE_URL) || "https://api.resend.com").replace(/\/+$/, "");
const REMINDER_ALLOW_DRY_RUN = safeString(process.env.REMINDER_ALLOW_DRY_RUN).toLowerCase() === "true";
const APP_BASE_URL = safeString(process.env.APP_BASE_URL) || `http://${HOST}:${PORT}`;
const STORAGE_DIR = path.join(ROOT_DIR, "storage");
/** Per-collection vector sizes (tenant-scoped collection names). */
const vectorSizeByCollection = new Map();
const BILL_SCAN_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);
const DEFAULT_CA_VECTOR_SIZE = 8;
const DEFAULT_ONBOARDING_VECTOR_SIZE = 8;
const DEFAULT_BUSINESS_CONTEXT_VECTOR_SIZE = 8;
let caVectorSize = DEFAULT_CA_VECTOR_SIZE;
let onboardingVectorSize = DEFAULT_ONBOARDING_VECTOR_SIZE;
let businessContextVectorSize = DEFAULT_BUSINESS_CONTEXT_VECTOR_SIZE;

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

app.get("/api/bills", (req, res) => {
  const workspaceKey = buildCaWorkspaceKey({
    companyName: safeString(req.query?.companyName),
    fullName: safeString(req.query?.fullName)
  });
  res.status(200).json({
    success: true,
    workspace: readBillWorkspace(workspaceKey)
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
    const workspaceKey = buildCaWorkspaceKey({
      companyName: safeString(req.body?.companyName),
      fullName: safeString(req.body?.fullName)
    });

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
    const workspace = readBillWorkspace(workspaceKey);
    workspace.documents = [document, ...workspace.documents];
    workspace.transactions = [...transactions, ...workspace.transactions];
    writeBillWorkspace(workspace, workspaceKey);

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

app.post("/api/assistant/chat", async (req, res) => {
  try {
    const workspaceKey = buildCaWorkspaceKey({
      companyName: safeString(req.body?.companyName),
      fullName: safeString(req.body?.fullName || req.body?.founderName)
    });
    let onboardingProfile = normalizeOnboardingProfile(req.body?.onboardingProfile || {});
    try {
      const storedProfile = await readOnboardingProfile(workspaceKey);
      onboardingProfile = {
        ...onboardingProfile,
        ...storedProfile
      };
    } catch (error) {
      console.error("Onboarding profile fetch skipped:", error.message || error);
    }

    const response = await fetch(`${BRAIN_SERVICE_URL}/assistant/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question: safeString(req.body?.question),
        company_name: safeString(req.body?.companyName),
        founder_name: safeString(req.body?.founderName),
        reminders: req.body?.reminders || {},
        ca_rows: Array.isArray(req.body?.caRows) ? req.body.caRows : [],
        onboarding_profile: onboardingProfile || {}
      })
    });

    const payload = await readJsonResponse(response);
    res.status(response.status).json(payload);
  } catch (error) {
    console.error("Assistant chat proxy error:", error);
    res.status(502).json({ error: "Could not reach AI assistant service." });
  }
});

app.post("/api/policy-watch/scan", async (req, res) => {
  try {
    let onboardingProfile = normalizeOnboardingProfile(req.body?.onboardingProfile || {});
    const workspaceKey = buildCaWorkspaceKey({
      companyName: safeString(req.body?.companyName),
      fullName: safeString(req.body?.fullName || req.body?.founderName)
    });
    try {
      const storedProfile = await readOnboardingProfile(workspaceKey);
      onboardingProfile = {
        ...onboardingProfile,
        ...storedProfile
      };
    } catch (error) {
      console.error("Policy watch profile fetch skipped:", error.message || error);
    }

    let businessContext = {};
    try {
      businessContext = await readBusinessContextSnapshot(workspaceKey);
    } catch (error) {
      console.error("Policy watch business context fetch skipped:", error.message || error);
    }

    let caPortalLive = {
      rowCount: 0,
      overdue: 0,
      pending: 0,
      inprogress: 0,
      filed: 0,
      upcomingFilings: []
    };
    try {
      const rows = await readCaRows(workspaceKey);
      caPortalLive = summarizeCaRowsForPolicy(rows);
    } catch (error) {
      console.error("Policy watch CA rows fetch skipped:", error.message || error);
    }

    const response = await fetch(`${BRAIN_SERVICE_URL}/policy-watch/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        company_name: safeString(req.body?.companyName),
        founder_name: safeString(req.body?.fullName || req.body?.founderName),
        onboarding_profile: onboardingProfile || {},
        business_context: {
          ...businessContext,
          caPortalLive,
          serverMergedAt: new Date().toISOString()
        }
      })
    });

    const payload = await readJsonResponse(response);
    res.status(response.status).json(payload);
  } catch (error) {
    console.error("Policy watch proxy error:", error);
    res.status(502).json({ error: "Could not reach policy watch service." });
  }
});

app.post("/api/onboarding/profile", async (req, res) => {
  try {
    const workspaceKey = buildCaWorkspaceKey({
      companyName: safeString(req.body?.companyName),
      fullName: safeString(req.body?.fullName || req.body?.founderName)
    });
    const profile = normalizeOnboardingProfile(req.body?.profile);
    if (!profile.companyType || !profile.stateCode || !profile.employeeBand) {
      res.status(400).json({ error: "Company type, state, and employee band are required." });
      return;
    }

    await upsertOnboardingProfile(workspaceKey, profile);
    res.status(200).json({
      success: true,
      workspaceKey,
      profile
    });
  } catch (error) {
    console.error("Onboarding profile save error:", error);
    res.status(502).json({ error: error.message || "Could not store onboarding profile." });
  }
});

app.post("/api/business-context/upsert", async (req, res) => {
  try {
    const workspaceKey = buildCaWorkspaceKey({
      companyName: safeString(req.body?.companyName),
      fullName: safeString(req.body?.fullName || req.body?.founderName)
    });
    const snapshot = req.body?.snapshot && typeof req.body.snapshot === "object" ? req.body.snapshot : req.body || {};
    await upsertBusinessContextSnapshot(workspaceKey, {
      companyName: safeString(req.body?.companyName),
      founderName: safeString(req.body?.fullName || req.body?.founderName),
      ...snapshot
    });
    res.status(200).json({ success: true, workspaceKey });
  } catch (error) {
    console.error("Business context upsert error:", error);
    res.status(200).json({
      success: false,
      message: error.message || "Could not store business context in Qdrant."
    });
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
    const isNewObligation = !row.id;
    if (!row.client || !row.filing || !row.dept || !row.dueDate) {
      res.status(400).json({ error: "Client, filing, department, and due date are required." });
      return;
    }

    const vecSize = await ensureCaCollection(workspaceKey);
    const collectionName = resolveQdrantCollection(QDRANT_CA_COLLECTION, workspaceKey);
    const point = buildCaPoint(row, workspaceKey, vecSize);
    await qdrantRequest("PUT", `/collections/${encodeURIComponent(collectionName)}/points?wait=true`, {
      points: [point]
    });

    const rows = await readCaRows(workspaceKey);
    const storedRow = rows.find((item) => item.id === point.id) || caRowFromPayload(point.payload, point.id);
    const reminderResult = isNewObligation
      ? await autoDispatchReminderForNewObligation(storedRow, req.body)
      : null;

    res.status(200).json({
      success: true,
      rows,
      row: storedRow,
      reminder: reminderResult,
      message: row.id
        ? "CA portal filing updated."
        : reminderResult?.sent
          ? `New CA filing added and ${reminderResult.triggerLabel.toLowerCase()} reminder dispatched.`
          : "New CA filing added."
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

    const vecSize = await ensureCaCollection(workspaceKey);
    const collectionName = resolveQdrantCollection(QDRANT_CA_COLLECTION, workspaceKey);
    const points = rows.map((row) => buildCaPoint({
      ...row,
      status: "filed"
    }, workspaceKey, vecSize));

    await qdrantRequest("PUT", `/collections/${encodeURIComponent(collectionName)}/points?wait=true`, {
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

app.get("/api/reminders/status", (_req, res) => {
  res.status(200).json({
    success: true,
    resendConfigured: Boolean(RESEND_API_KEY),
    dryRunEnabled: REMINDER_ALLOW_DRY_RUN
  });
});

app.post("/api/reminders/dispatch", async (req, res) => {
  try {
    const payload = normalizeReminderPayload(req.body);
    if (!payload.obligationName || !payload.dueDate) {
      res.status(400).json({ error: "Obligation and due date are required." });
      return;
    }

    const scheduleEntry = REMINDER_SCHEDULE[payload.trigger];
    if (!scheduleEntry) {
      res.status(400).json({ error: "Unsupported reminder trigger." });
      return;
    }

    const result = await dispatchReminder({
      payload,
      scheduleEntry,
      source: "manual_dispatch"
    });

    const obligationKey = buildObligationKey(payload);
    reminderStatusByObligation.set(obligationKey, {
      trigger: result.trigger,
      triggerLabel: result.triggerLabel,
      channels: result.channels,
      lastDispatchedAt: new Date().toISOString(),
      recipients: result.recipients
    });
    reminderDispatchHistory.add(`${obligationKey}::${result.trigger}`);

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("Reminder dispatch error:", error);
    res.status(502).json({ error: error.message || "Could not dispatch reminder." });
  }
});

app.post("/api/reminders/action", async (req, res) => {
  try {
    const payload = normalizeReminderPayload(req.body);
    const action = safeString(req.body?.action).trim().toLowerCase();
    const scheduleEntry = REMINDER_SCHEDULE[payload.trigger] || REMINDER_SCHEDULE.event_new_obligation;

    if (!["filed", "remind", "penalty"].includes(action)) {
      res.status(400).json({ error: "Unsupported reminder action." });
      return;
    }

    if (action === "filed") {
      res.status(200).json({
        success: true,
        message: `Marked ${payload.obligationName || "obligation"} as filed. The reminder thread is now resolved.`
      });
      return;
    }

    if (action === "penalty") {
      res.status(200).json({
        success: true,
        message: `Penalty view opened for ${payload.obligationName || "this filing"}.`,
        penaltyUrl: `${APP_BASE_URL}/#tab-penalty`
      });
      return;
    }

    const recipients = buildActionRecipients(payload, scheduleEntry.recipientMode);
    if (!recipients.length) {
      res.status(400).json({ error: "Owner/CA email is missing. Add recipient emails first." });
      return;
    }

    const dueDateLabel = formatHumanDate(payload.dueDate) || "Not specified";
    const subject = `Reminder: ${payload.obligationName || "Compliance obligation"} needs attention`;
    const html = `
      <p>Hello,</p>
      <p>This is a follow-up reminder for <strong>${escapeHtml(payload.obligationName || "the obligation")}</strong>.</p>
      <p>Company: ${escapeHtml(payload.companyName || "CompliSure Account")}</p>
      <p>Due date: ${escapeHtml(dueDateLabel)}</p>
      <p><a href="${escapeHtml(`${APP_BASE_URL}/#tools`)}">Open CompliSure dashboard</a></p>
    `;
    const text = [
      `Reminder: ${payload.obligationName || "Compliance obligation"}`,
      `Company: ${payload.companyName || "CompliSure Account"}`,
      `Due date: ${dueDateLabel}`,
      `Open dashboard: ${APP_BASE_URL}/#tools`
    ].join("\n");

    const emailResults = await sendActionEmails({
      recipients,
      subject,
      html,
      text
    });

    res.status(200).json({
      success: true,
      message: `Reminder sent to ${emailResults.length} recipient${emailResults.length === 1 ? "" : "s"}.`,
      channels: scheduleEntry.channels,
      emailResults
    });
  } catch (error) {
    console.error("Reminder action error:", error);
    res.status(502).json({ error: error.message || "Could not complete reminder action." });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`CompliSure listening on http://${HOST}:${PORT}`);
  console.log(`Proxying Aadhaar requests to ${BRAIN_SERVICE_URL}`);
  if (!isEncryptionEnabled()) {
    console.warn("COMPLISURE_ENCRYPTION_KEY not set: Qdrant payloads and bill ledgers are stored unencrypted.");
  }
  console.log(
    `Multi-tenant Qdrant: ${isMultiTenantQdrant() ? "per-workspace collections" : "legacy shared collections"}`
  );
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

function readBillWorkspace(workspaceKey) {
  try {
    const filePath = billLedgerFilePath(STORAGE_DIR, workspaceKey);
    if (!fs.existsSync(filePath)) {
      return createEmptyBillWorkspace();
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const jsonStr = decryptFilePayload(raw);
    const parsed = jsonStr ? JSON.parse(jsonStr) : {};
    return {
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : []
    };
  } catch (error) {
    console.error("Could not read bill workspace:", error);
    return createEmptyBillWorkspace();
  }
}

function writeBillWorkspace(workspace, workspaceKey) {
  const filePath = billLedgerFilePath(STORAGE_DIR, workspaceKey);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const jsonStr = JSON.stringify({
    documents: Array.isArray(workspace.documents) ? workspace.documents : [],
    transactions: Array.isArray(workspace.transactions) ? workspace.transactions : []
  }, null, 2);
  const enc = encryptFilePayload(jsonStr);
  if (enc.plain) {
    fs.writeFileSync(filePath, enc.body);
  } else {
    fs.writeFileSync(filePath, JSON.stringify({ plain: false, body: enc.body }, null, 2));
  }
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

/**
 * Qdrant requires a keyword payload index on `workspaceKey` before scroll/filter can use it
 * (legacy shared collections). Safe to create on tenant-scoped collections too.
 */
async function ensureWorkspaceKeyPayloadIndex(collectionName) {
  try {
    await qdrantRequest("PUT", `/collections/${encodeURIComponent(collectionName)}/index?wait=true`, {
      field_name: "workspaceKey",
      field_schema: "keyword"
    });
  } catch (error) {
    const msg = String(error.message || "");
    const code = error.statusCode;
    if (code === 409 || /already exists|already exist|duplicate|Conflict/i.test(msg)) {
      return;
    }
    console.warn(`Qdrant workspaceKey index on ${collectionName}:`, msg);
  }
}

async function ensureCaCollection(workspaceKey) {
  const collectionName = resolveQdrantCollection(QDRANT_CA_COLLECTION, workspaceKey);
  if (vectorSizeByCollection.has(collectionName)) {
    await ensureWorkspaceKeyPayloadIndex(collectionName);
    return vectorSizeByCollection.get(collectionName);
  }
  ensureQdrantConfigured();

  try {
    const existing = await qdrantRequest("GET", `/collections/${encodeURIComponent(collectionName)}`);
    const size = inferCollectionVectorSize(existing) || caVectorSize;
    vectorSizeByCollection.set(collectionName, size);
    await ensureWorkspaceKeyPayloadIndex(collectionName);
    return size;
  } catch (error) {
    if (error.statusCode && error.statusCode !== 404) {
      throw error;
    }
  }

  const size = DEFAULT_CA_VECTOR_SIZE;
  await qdrantRequest("PUT", `/collections/${encodeURIComponent(collectionName)}`, {
    vectors: {
      size,
      distance: "Cosine"
    }
  });
  vectorSizeByCollection.set(collectionName, size);
  await ensureWorkspaceKeyPayloadIndex(collectionName);
  return size;
}

async function ensureOnboardingCollection(workspaceKey) {
  const collectionName = resolveQdrantCollection(QDRANT_ONBOARDING_COLLECTION, workspaceKey);
  if (vectorSizeByCollection.has(collectionName)) {
    await ensureWorkspaceKeyPayloadIndex(collectionName);
    return vectorSizeByCollection.get(collectionName);
  }
  ensureQdrantConfigured();

  try {
    const existing = await qdrantRequest("GET", `/collections/${encodeURIComponent(collectionName)}`);
    const size = inferCollectionVectorSize(existing) || onboardingVectorSize;
    vectorSizeByCollection.set(collectionName, size);
    await ensureWorkspaceKeyPayloadIndex(collectionName);
    return size;
  } catch (error) {
    if (error.statusCode && error.statusCode !== 404) {
      throw error;
    }
  }

  const size = DEFAULT_ONBOARDING_VECTOR_SIZE;
  await qdrantRequest("PUT", `/collections/${encodeURIComponent(collectionName)}`, {
    vectors: {
      size,
      distance: "Cosine"
    }
  });
  vectorSizeByCollection.set(collectionName, size);
  await ensureWorkspaceKeyPayloadIndex(collectionName);
  return size;
}

async function upsertOnboardingProfile(workspaceKey, profile) {
  const vecSize = await ensureOnboardingCollection(workspaceKey);
  const collectionName = resolveQdrantCollection(QDRANT_ONBOARDING_COLLECTION, workspaceKey);
  const normalized = normalizeOnboardingProfile(profile);
  const plainPayload = {
    workspaceKey,
    profile: normalized,
    updatedAt: new Date().toISOString()
  };
  const payload = wrapQdrantPayload(plainPayload);
  const point = {
    id: buildDeterministicUuid(`onboarding|${workspaceKey}`),
    payload,
    vector: buildDeterministicVector(`onboarding|${workspaceKey}|${JSON.stringify(normalized)}`, vecSize)
  };

  await qdrantRequest("PUT", `/collections/${encodeURIComponent(collectionName)}/points?wait=true`, {
    points: [point]
  });
}

async function readOnboardingProfile(workspaceKey) {
  await ensureOnboardingCollection(workspaceKey);
  const collectionName = resolveQdrantCollection(QDRANT_ONBOARDING_COLLECTION, workspaceKey);
  const scrollBody = isMultiTenantQdrant()
    ? { limit: 1, with_payload: true, with_vector: false }
    : {
        limit: 1,
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
      };

  const response = await qdrantRequest("POST", `/collections/${encodeURIComponent(collectionName)}/points/scroll`, scrollBody);

  const points = Array.isArray(response?.result?.points) ? response.result.points : [];
  const rawPayload = points[0]?.payload || {};
  const unwrapped = unwrapQdrantPayload(rawPayload);
  return normalizeOnboardingProfile(unwrapped?.profile || {});
}

async function ensureBusinessContextCollection(workspaceKey) {
  const collectionName = resolveQdrantCollection(QDRANT_BUSINESS_CONTEXT_COLLECTION, workspaceKey);
  if (vectorSizeByCollection.has(collectionName)) {
    await ensureWorkspaceKeyPayloadIndex(collectionName);
    return vectorSizeByCollection.get(collectionName);
  }
  ensureQdrantConfigured();

  try {
    const existing = await qdrantRequest("GET", `/collections/${encodeURIComponent(collectionName)}`);
    const size = inferCollectionVectorSize(existing) || businessContextVectorSize;
    vectorSizeByCollection.set(collectionName, size);
    await ensureWorkspaceKeyPayloadIndex(collectionName);
    return size;
  } catch (error) {
    if (error.statusCode && error.statusCode !== 404) {
      throw error;
    }
  }

  const size = DEFAULT_BUSINESS_CONTEXT_VECTOR_SIZE;
  await qdrantRequest("PUT", `/collections/${encodeURIComponent(collectionName)}`, {
    vectors: {
      size,
      distance: "Cosine"
    }
  });
  vectorSizeByCollection.set(collectionName, size);
  await ensureWorkspaceKeyPayloadIndex(collectionName);
  return size;
}

function normalizeBusinessSnapshot(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const cal = source.calendar && typeof source.calendar === "object" ? source.calendar : {};
  const ch = source.complianceHealth && typeof source.complianceHealth === "object" ? source.complianceHealth : null;
  const ca = source.caPortal && typeof source.caPortal === "object" ? source.caPortal : {};
  const pw = source.policyWatch && typeof source.policyWatch === "object" ? source.policyWatch : {};
  const rem = source.reminders && typeof source.reminders === "object" ? source.reminders : {};
  return {
    companyName: safeString(source.companyName),
    founderName: safeString(source.founderName || source.fullName),
    onboardingProfile: normalizeOnboardingProfile(source.onboardingProfile || source.profile),
    calendar: {
      itemCount: Number.parseInt(cal.itemCount, 10) || 0,
      stageCounts: cal.stageCounts && typeof cal.stageCounts === "object" ? cal.stageCounts : {},
      profile: cal.profile && typeof cal.profile === "object" ? cal.profile : null,
      topObligations: Array.isArray(cal.topObligations) ? cal.topObligations.slice(0, 20) : []
    },
    complianceHealth: ch
      ? {
          score: Number.isFinite(Number(ch.score)) ? Number(ch.score) : null,
          overdue: Number.parseInt(ch.overdue, 10) || 0,
          dueSoon: Number.parseInt(ch.dueSoon, 10) || 0,
          onTrack: Number.parseInt(ch.onTrack, 10) || 0,
          noDate: Number.parseInt(ch.noDate, 10) || 0
        }
      : null,
    caPortal: {
      rowCount: Number.parseInt(ca.rowCount, 10) || 0,
      overdue: Number.parseInt(ca.overdue, 10) || 0,
      pending: Number.parseInt(ca.pending, 10) || 0,
      inprogress: Number.parseInt(ca.inprogress, 10) || 0,
      filed: Number.parseInt(ca.filed, 10) || 0,
      sampleFilings: Array.isArray(ca.sampleFilings) ? ca.sampleFilings.slice(0, 12) : []
    },
    policyWatch: {
      lastScanAt: safeString(pw.lastScanAt),
      alertCount: Number.parseInt(pw.alertCount, 10) || 0
    },
    reminders: {
      trigger: safeString(rem.trigger),
      companyName: safeString(rem.companyName)
    },
    updatedAt: safeString(source.updatedAt) || new Date().toISOString()
  };
}

function buildBusinessSnapshotEmbeddingText(snapshot) {
  const lines = [
    safeString(snapshot.companyName),
    safeString(snapshot.founderName),
    JSON.stringify(snapshot.onboardingProfile || {}),
    `calendar:${snapshot.calendar?.itemCount || 0}`,
    `health:${snapshot.complianceHealth?.score ?? "na"}`,
    `ca_rows:${snapshot.caPortal?.rowCount || 0}|overdue:${snapshot.caPortal?.overdue || 0}`,
    `policy_alerts:${snapshot.policyWatch?.alertCount || 0}`
  ];
  return lines.join("\n");
}

async function upsertBusinessContextSnapshot(workspaceKey, snapshot) {
  const vecSize = await ensureBusinessContextCollection(workspaceKey);
  const collectionName = resolveQdrantCollection(QDRANT_BUSINESS_CONTEXT_COLLECTION, workspaceKey);
  const normalized = normalizeBusinessSnapshot({ ...snapshot, updatedAt: new Date().toISOString() });
  const plainPayload = {
    workspaceKey,
    kind: "business_context_v1",
    snapshot: normalized,
    updatedAt: normalized.updatedAt
  };
  const payload = wrapQdrantPayload(plainPayload);
  const embedText = buildBusinessSnapshotEmbeddingText(normalized);
  const point = {
    id: buildDeterministicUuid(`business-context|${workspaceKey}`),
    payload,
    vector: buildDeterministicVector(`${workspaceKey}|${embedText}`, vecSize)
  };

  await qdrantRequest("PUT", `/collections/${encodeURIComponent(collectionName)}/points?wait=true`, {
    points: [point]
  });
}

async function readBusinessContextSnapshot(workspaceKey) {
  await ensureBusinessContextCollection(workspaceKey);
  const collectionName = resolveQdrantCollection(QDRANT_BUSINESS_CONTEXT_COLLECTION, workspaceKey);
  const scrollBody = isMultiTenantQdrant()
    ? { limit: 1, with_payload: true, with_vector: false }
    : {
        limit: 1,
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
      };

  const response = await qdrantRequest("POST", `/collections/${encodeURIComponent(collectionName)}/points/scroll`, scrollBody);

  const points = Array.isArray(response?.result?.points) ? response.result.points : [];
  const rawPayload = points[0]?.payload || {};
  const unwrapped = unwrapQdrantPayload(rawPayload);
  const snap = unwrapped?.snapshot;
  if (!snap || typeof snap !== "object") {
    return {};
  }
  return normalizeBusinessSnapshot(snap);
}

function summarizeCaRowsForPolicy(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let overdue = 0;
  let pending = 0;
  let filed = 0;
  let inprogress = 0;
  for (const row of list) {
    const status = safeString(row?.status).toLowerCase();
    if (status === "overdue") {
      overdue += 1;
    } else if (status === "pending") {
      pending += 1;
    } else if (status === "filed") {
      filed += 1;
    } else if (status === "inprogress") {
      inprogress += 1;
    }
  }
  return {
    rowCount: list.length,
    overdue,
    pending,
    inprogress,
    filed,
    upcomingFilings: list.slice(0, 14).map((row) => ({
      client: safeString(row?.client),
      filing: safeString(row?.filing),
      dept: safeString(row?.dept),
      dueDate: safeString(row?.dueDate),
      status: safeString(row?.status)
    }))
  };
}

async function readCaRows(workspaceKey) {
  await ensureCaCollection(workspaceKey);
  const collectionName = resolveQdrantCollection(QDRANT_CA_COLLECTION, workspaceKey);
  const scrollBody = isMultiTenantQdrant()
    ? { limit: 200, with_payload: true, with_vector: false }
    : {
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
      };

  const response = await qdrantRequest("POST", `/collections/${encodeURIComponent(collectionName)}/points/scroll`, scrollBody);

  const points = Array.isArray(response?.result?.points) ? response.result.points : [];
  return points
    .map((point) => caRowFromPayload(point.payload, point.id))
    .sort(sortCaRows);
}

async function seedDefaultCaRows(workspaceKey) {
  const vecSize = await ensureCaCollection(workspaceKey);
  const collectionName = resolveQdrantCollection(QDRANT_CA_COLLECTION, workspaceKey);

  const points = DEFAULT_CA_ROWS.map((row) => buildCaPoint(normalizeCaRow(row), workspaceKey, vecSize));
  await qdrantRequest("PUT", `/collections/${encodeURIComponent(collectionName)}/points?wait=true`, {
    points
  });

  return points
    .map((point) => caRowFromPayload(point.payload, point.id))
    .sort(sortCaRows);
}

function buildCaPoint(row, workspaceKey, vectorSize) {
  const normalized = normalizeCaRow(row);
  const id = normalized.id || createId("ca");
  const pointId = toQdrantPointId(id);
  const plainPayload = {
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
  const payload = wrapQdrantPayload(plainPayload);
  const size =
    Number.isInteger(vectorSize) && vectorSize > 0
      ? vectorSize
      : Number.isInteger(caVectorSize) && caVectorSize > 0
        ? caVectorSize
        : DEFAULT_CA_VECTOR_SIZE;

  return {
    id: pointId,
    payload,
    vector: buildDeterministicVector(
      `${workspaceKey}|${plainPayload.id}|${plainPayload.client}|${plainPayload.filing}|${plainPayload.dept}|${plainPayload.dueDate}|${plainPayload.status}`,
      size
    )
  };
}

function caRowFromPayload(payload, id) {
  const normalized = unwrapQdrantPayload(payload) || {};
  if (!normalized || typeof normalized !== "object") {
    return {
      id: safeString(id),
      client: "",
      filing: "",
      dept: "",
      dueDate: "",
      due: "Date not set",
      dueTone: "amber",
      status: "pending",
      createdAt: "",
      updatedAt: ""
    };
  }
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

function buildDeterministicVector(text, requestedSize) {
  const digest = createHash("sha256").update(text).digest();
  const vector = [];
  const size = Number.isInteger(requestedSize) && requestedSize > 0
    ? requestedSize
    : Number.isInteger(caVectorSize) && caVectorSize > 0
      ? caVectorSize
      : DEFAULT_CA_VECTOR_SIZE;

  for (let index = 0; index < size; index += 1) {
    const raw = digest[index] / 255;
    vector.push(Number(((raw * 2) - 1).toFixed(6)));
  }

  return vector;
}

function buildDeterministicUuid(text) {
  const digest = createHash("sha256").update(text).digest("hex");
  const part1 = digest.slice(0, 8);
  const part2 = digest.slice(8, 12);
  const part3 = `4${digest.slice(13, 16)}`;
  const part4Nibble = (Number.parseInt(digest.slice(16, 17), 16) & 0x3) | 0x8;
  const part4 = `${part4Nibble.toString(16)}${digest.slice(17, 20)}`;
  const part5 = digest.slice(20, 32);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

function normalizeOnboardingProfile(profile) {
  const source = profile || {};
  return {
    companyType: safeString(source.companyType || source.type),
    sector: safeString(source.sector),
    stateCode: safeString(source.stateCode),
    employeeBand: safeString(source.employeeBand),
    gst: safeString(source.gst),
    deposits: safeString(source.deposits),
    calendarItems: Number.parseInt(source.calendarItems, 10) || 0,
    stageSummary: safeString(source.stageSummary || "")
  };
}

function inferCollectionVectorSize(collectionResponse) {
  const vectorsConfig = collectionResponse?.result?.config?.params?.vectors;
  if (!vectorsConfig) return null;

  if (typeof vectorsConfig === "object" && Number.isInteger(vectorsConfig.size)) {
    return vectorsConfig.size;
  }

  if (typeof vectorsConfig === "object") {
    const namedVector = Object.values(vectorsConfig).find((entry) => Number.isInteger(entry?.size));
    if (namedVector) {
      return namedVector.size;
    }
  }

  return null;
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

function toQdrantPointId(value) {
  const raw = safeString(value).trim();
  if (!raw) return randomUUID();
  if (isUuid(raw)) return raw.toLowerCase();

  const uuidSuffix = raw.match(/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  if (uuidSuffix && isUuid(uuidSuffix[1])) {
    return uuidSuffix[1].toLowerCase();
  }

  return randomUUID();
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

async function autoDispatchReminderForNewObligation(row, body) {
  const reminderPayload = normalizeReminderPayload({
    trigger: pickTriggerForDueDate(row?.dueDate),
    obligationId: row?.id,
    obligationName: row?.filing,
    dueDate: row?.dueDate,
    companyName: safeString(body?.companyName) || row?.client || "CompliSure Account",
    ownerName: safeString(body?.fullName) || "Owner",
    ownerEmail: body?.ownerEmail,
    caName: safeString(body?.caName) || "Linked CA",
    caEmail: body?.caEmail
  });
  const scheduleEntry = REMINDER_SCHEDULE[reminderPayload.trigger] || REMINDER_SCHEDULE.event_new_obligation;

  const recipients = buildActionRecipients(reminderPayload, scheduleEntry.recipientMode);
  if (scheduleEntry.sendsEmail && !recipients.length) {
    return {
      sent: false,
      skipped: true,
      reason: "Recipient emails missing for trigger.",
      trigger: reminderPayload.trigger,
      triggerLabel: scheduleEntry.label,
      channels: scheduleEntry.channels
    };
  }

  try {
    const result = await dispatchReminder({
      payload: reminderPayload,
      scheduleEntry,
      source: "auto_on_new_obligation"
    });

    const obligationKey = buildObligationKey(reminderPayload);
    reminderStatusByObligation.set(obligationKey, {
      trigger: result.trigger,
      triggerLabel: result.triggerLabel,
      channels: result.channels,
      lastDispatchedAt: new Date().toISOString(),
      recipients: result.recipients
    });
    reminderDispatchHistory.add(`${obligationKey}::${result.trigger}`);

    return {
      sent: true,
      skipped: false,
      ...result
    };
  } catch (error) {
    console.error("Auto reminder dispatch failed:", error);
    return {
      sent: false,
      skipped: true,
      reason: error.message || "Reminder dispatch failed.",
      trigger: reminderPayload.trigger,
      triggerLabel: scheduleEntry.label,
      channels: scheduleEntry.channels
    };
  }
}

function pickTriggerForDueDate(dueDate) {
  const due = parseIsoDate(safeString(dueDate));
  if (!due) return "event_new_obligation";
  const today = todayUtcDate();
  const delta = daysBetweenUtc(today, due);
  if (delta < 0) return "1_day_after_due";
  if (delta === 0) return "due_date";
  if (delta <= 3) return "3_days_before";
  if (delta <= 7) return "7_days_before";
  if (delta <= 30) return "30_days_before";
  return "event_new_obligation";
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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(safeString(value).trim());
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
