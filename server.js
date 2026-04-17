const express = require("express");
const path = require("path");
const fs = require("fs");

loadEnv(path.join(process.cwd(), ".env"));

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "127.0.0.1";
const BRAIN_SERVICE_URL = process.env.BRAIN_SERVICE_URL || "http://127.0.0.1:8000";
const ROOT_DIR = process.cwd();
const RESEND_API_KEY = safeString(process.env.RESEND_API_KEY);
const RESEND_FROM_EMAIL = safeString(process.env.RESEND_FROM_EMAIL) || "CompliSure <onboarding@resend.dev>";
const RESEND_BASE_URL = (safeString(process.env.RESEND_BASE_URL) || "https://api.resend.com").replace(/\/+$/, "");
const REMINDER_ALLOW_DRY_RUN = safeString(process.env.REMINDER_ALLOW_DRY_RUN).toLowerCase() === "true";
const APP_BASE_URL = safeString(process.env.APP_BASE_URL) || `http://${HOST}:${PORT}`;

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

app.use(express.json({ limit: "15mb" }));
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
