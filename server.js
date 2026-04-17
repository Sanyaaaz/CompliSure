const express = require("express");
const path = require("path");
const fs = require("fs");
const engine = require("./engine"); // Import the new Smart Engine

loadEnv(path.join(process.cwd(), ".env"));

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "127.0.0.1";
const BRAIN_SERVICE_URL = process.env.BRAIN_SERVICE_URL || "http://127.0.0.1:8000";
const ROOT_DIR = process.cwd();

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

app.post("/api/bills/scan", async (req, res) => {
  const fileName = safeString(req.body?.fileName);
  const mimeType = safeString(req.body?.mimeType);
  const imageBase64 = safeString(req.body?.imageBase64);

  if (!fileName || !mimeType || !imageBase64) {
    res.status(400).json({ error: "Bill upload is incomplete. Add a file name, mime type, and image payload." });
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
        image_base64: imageBase64
      })
    });

    const payload = await readJsonResponse(response);
    res.status(response.status).json(payload);
  } catch (error) {
    console.error("Bill scan proxy error:", error);
    res.status(502).json({ error: "Could not reach the bill scanning service." });
  }
});

// --- SMART REGULATORY UPDATE ENGINE ENDPOINTS ---

const db = require("./engine/database/mockDb");

app.post("/api/engine/trigger", async (req, res) => {
  const url = req.body?.url;
  const sourceName = req.body?.sourceName;

  if (!url || !sourceName) {
    return res.status(400).json({ error: "url and sourceName are required" });
  }

  // Trigger asynchronously so we don't block the request if it takes long
  engine.processSource(url, sourceName)
    .then(result => console.log("Engine manual trigger completed:", result))
    .catch(err => console.error("Engine manual trigger failed:", err));

  res.status(202).json({ message: "Engine processing started in background", url, sourceName });
});

app.post("/api/engine/ca-verify", async (req, res) => {
  const verificationId = req.body?.verificationId;
  const action = req.body?.action; // 'approve', 'edit', 'reject'
  const modifications = req.body?.modifications;

  if (!verificationId || !action) {
    return res.status(400).json({ error: "verificationId and action are required" });
  }

  try {
    const result = await engine.handleCAVerification(verificationId, action, modifications);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/engine/updates", async (req, res) => {
  const recommendations = await db.getRecommendations();
  res.status(200).json(recommendations);
});

// --- MOCK GOV PORTAL SIMULATOR ---
app.post("/api/admin/mock-gov", async (req, res) => {
  const title = req.body?.title;
  const content = req.body?.content;
  if (!title || !content) {
    return res.status(400).json({ error: "title and content required" });
  }
  await db.setMockGovPortal(title, content);
  res.status(200).json({ message: "Mock Gov portal updated!" });
});

app.get("/mock-gov-portal", async (req, res) => {
  const data = await db.getMockGovPortal();
  
  // Serve HTML that matches the 'mca' selectors defined in selectors.json
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Government Notifications</title></head>
      <body>
        <h1 class="notification-title">${data.title}</h1>
        <span class="publish-date">${data.date}</span>
        <div class="notification-content">
          ${data.content.split('\n').map(p => `<p>${p}</p>`).join('')}
        </div>
      </body>
    </html>
  `;
  res.send(html);
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
