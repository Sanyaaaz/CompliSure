const onboardingPanel = `
  <div class="demo-panel active" id="tab-onboard">
    <div class="eyebrow" style="margin-bottom:.5rem">6 questions - your personal compliance universe</div>
    <h3 style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:var(--text);margin-bottom:1.75rem">Generate your compliance calendar</h3>
    <div class="onboard-form">
      <div class="field">
        <label>Company type</label>
        <select id="co-type">
          <option value="">Select type</option>
          <option value="pvt">Private Limited (Pvt Ltd)</option>
          <option value="llp">LLP</option>
          <option value="opc">One Person Company (OPC)</option>
          <option value="prop">Proprietorship</option>
        </select>
      </div>
      <div class="field">
        <label>Industry sector</label>
        <select id="co-sector">
          <option value="">Select sector</option>
          <option value="it">IT Services / SaaS</option>
          <option value="mfg">Manufacturing</option>
          <option value="trading">Trading</option>
          <option value="nbfc">NBFC / Finance</option>
          <option value="other">Other services</option>
        </select>
      </div>
      <div class="field">
        <label>State of incorporation</label>
        <select id="co-state">
          <option value="">Select state</option>
          <option value="MH">Maharashtra</option>
          <option value="KA">Karnataka</option>
          <option value="DL">Delhi</option>
          <option value="TN">Tamil Nadu</option>
          <option value="WB">West Bengal</option>
          <option value="TG">Telangana</option>
          <option value="GJ">Gujarat</option>
        </select>
      </div>
      <div class="field">
        <label>Employee headcount</label>
        <div class="radio-group" id="emp-group">
          <div class="radio-btn" data-val="0">Just me</div>
          <div class="radio-btn" data-val="1-9">1-9</div>
          <div class="radio-btn" data-val="10-19">10-19</div>
          <div class="radio-btn" data-val="20-99">20-99</div>
          <div class="radio-btn" data-val="100+">100+</div>
        </div>
      </div>
      <div class="field">
        <label>GST registration status</label>
        <div class="radio-group" id="gst-group">
          <div class="radio-btn" data-val="none">Not registered</div>
          <div class="radio-btn" data-val="regular">Regular taxpayer</div>
          <div class="radio-btn" data-val="composition">Composition scheme</div>
        </div>
      </div>
      <div class="field">
        <label>Accepted deposits from directors / shareholders?</label>
        <div class="radio-group" id="dep-group">
          <div class="radio-btn" data-val="yes">Yes</div>
          <div class="radio-btn" data-val="no">No / Not sure</div>
        </div>
      </div>
      <button class="gen-btn" id="generate-calendar-btn" type="button">Generate my compliance calendar -&gt;</button>
      <button class="calc-btn" id="view-calendar-btn" type="button" style="margin-top:.65rem">View saved calendar</button>
    </div>
    <div class="calendar-output" id="cal-output">
      <div id="cal-health-inline"></div>
      <div class="cal-heading" id="cal-heading">Your compliance calendar - 2026-27</div>
      <div id="cal-items"></div>
      <div class="cal-summary" id="cal-summary"></div>
    </div>
  </div>
`;

const penaltyPanel = `
  <div class="demo-panel" id="tab-penalty">
    <div class="eyebrow" style="margin-bottom:.5rem">Live compounding penalty</div>
    <h3 style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:var(--text);margin-bottom:1.75rem">See what a missed filing is costing you right now</h3>
    <div class="penalty-calc">
      <div class="form-col">
        <div class="pen-form-field">
          <label>Filing / Form</label>
          <select id="pen-form">
            <option value="">Select filing</option>
            <option value="MGT-7">MGT-7 - Annual Return (MCA)</option>
            <option value="AOC-4">AOC-4 - Financial Statements (MCA)</option>
            <option value="DPT-3">DPT-3 - Return of Deposits</option>
            <option value="GSTR-3B">GSTR-3B - Monthly GST Return</option>
            <option value="ITR">ITR - Income Tax Return</option>
            <option value="TDS">TDS Return (26Q / 24Q)</option>
            <option value="PF">PF Challan</option>
            <option value="ESI">ESI Challan</option>
            <option value="DIR-12">DIR-12 - Director Change</option>
          </select>
        </div>
        <div class="pen-form-field">
          <label>Days overdue</label>
          <input type="number" id="pen-days" value="14" min="1" max="365" placeholder="Number of days" />
        </div>
        <div class="pen-form-field">
          <label>Company type</label>
          <select id="pen-cotype">
            <option value="pvt">Pvt Ltd / OPC</option>
            <option value="llp">LLP</option>
            <option value="small">Small company (&lt;Rs2Cr turnover)</option>
          </select>
        </div>
        <button class="calc-btn" id="calculate-penalty-btn" type="button">Calculate penalty -&gt;</button>
      </div>
      <div class="result-col" id="pen-result-col">
        <div style="text-align:center;color:var(--text3);padding:2rem 0">
          <div style="font-size:2rem;margin-bottom:.75rem">Penalty</div>
          <div style="font-size:14px">Select a filing and days overdue</div>
        </div>
      </div>
    </div>
  </div>
`;

const DEFAULT_CURRENCY = "INR";

function normalizeCurrencyCode(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return DEFAULT_CURRENCY;
  const upper = s.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) return upper;
  const symbolMap = {
    $: "USD",
    "€": "EUR",
    "£": "GBP",
    "₹": "INR",
    "￥": "JPY",
    "¥": "JPY"
  };
  if (symbolMap[s]) return symbolMap[s];
  return DEFAULT_CURRENCY;
}

function formatCurrency(value, currency = "INR") {
  const amount = Number(value) || 0;
  const code = normalizeCurrencyCode(currency);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: DEFAULT_CURRENCY,
      maximumFractionDigits: 2
    }).format(amount);
  }
}

function renderNoticePanel(state) {
  const workspace = state.noticeWorkspace || {};
  const interpretation = workspace.interpretation || null;
  const displaySourceLabel = workspace.selectedFileName || workspace.sourceLabel || "No file selected yet";
  const confidencePercent = interpretation ? Math.round((Number(interpretation.confidence) || 0) * 100) : 0;

  const amountsMarkup = interpretation?.keyAmounts?.length
    ? interpretation.keyAmounts.map((item) => `<span class="notice-chip">${escapeHtml(item)}</span>`).join("")
    : `<span class="notice-chip muted">No amount clearly visible</span>`;
  const sectionsMarkup = interpretation?.keySections?.length
    ? interpretation.keySections.map((item) => `<span class="notice-chip">${escapeHtml(item)}</span>`).join("")
    : `<span class="notice-chip muted">No legal section clearly visible</span>`;
  const requiredActionsMarkup = interpretation?.requiredActions?.length
    ? interpretation.requiredActions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>Review the notice with your compliance lead and identify the missing filing or response.</li>`;
  const nextStepsMarkup = interpretation?.immediateNextSteps?.length
    ? interpretation.immediateNextSteps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>Start with the authority portal or working papers mentioned in the notice.</li>`;
  const ignoredMarkup = interpretation?.whatHappensIfIgnored?.length
    ? interpretation.whatHappensIfIgnored.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>Escalation risk is unclear from the uploaded notice.</li>`;

  const chatMarkup = workspace.chatHistory?.length
    ? workspace.chatHistory.map((message) => `
      <div class="notice-chat-msg ${message.role === "user" ? "user" : "assistant"}">
        <div class="notice-chat-role">${message.role === "user" ? "You" : "CompliSure AI"}</div>
        <div class="notice-chat-body">${escapeHtml(message.content || "")}</div>
        ${message.businessImpact ? `<div class="notice-chat-impact"><strong>Business effect:</strong> ${escapeHtml(message.businessImpact)}</div>` : ""}
        ${Array.isArray(message.nextSteps) && message.nextSteps.length ? `<ul class="notice-chat-steps">${message.nextSteps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        ${message.caution ? `<div class="notice-chat-caution">${escapeHtml(message.caution)}</div>` : ""}
      </div>
    `).join("")
    : `<div class="notice-chat-empty">${escapeHtml(interpretation?.chatStarter || "Ask what this means for your cash flow, directors, response timeline, or next best step.")}</div>`;

  return `
    <div class="demo-panel" id="tab-notice">
      <div class="eyebrow" style="margin-bottom:.5rem">AI-powered notice desk</div>
      <h3 style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:var(--text);margin-bottom:1rem">Upload a notice or paste text to understand what it means for your business</h3>
      <p style="font-size:14px;color:var(--text2);line-height:1.7;margin-bottom:1.75rem;max-width:760px">CompliSure can analyze notice text, PDFs, screenshots, and images, explain the notice in plain English, outline business impact, and let you keep asking follow-up questions in the same workspace.</p>
      <div class="notice-grid">
        <div class="notice-input-area">
          <div class="bill-upload-card notice-upload-card">
            <div class="bill-upload-title">Notice intake</div>
            <p class="bill-upload-copy">Upload a PDF/image notice or paste the text. The assistant explains what the authority is saying, the risk to your business, and what to do next.</p>
            <label class="bill-dropzone" for="notice-upload-input">
              <input id="notice-upload-input" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif" />
              <span class="bill-dropzone-icon">📄</span>
              <span class="bill-dropzone-title">Choose a notice PDF or image</span>
              <span class="bill-dropzone-sub">${displaySourceLabel}</span>
            </label>
          </div>
          <textarea class="notice-ta" id="notice-text" placeholder="Paste notice text here...

Example: 'This is to inform that your company M/s ABC Pvt Ltd (CIN: U72200KA2021PTC134567) has failed to file Form MGT-7 for the financial year 2022-23 within the prescribed time. A penalty of Rs100 per day has been levied under Section 92(5) of the Companies Act 2013. The total outstanding amount is Rs18,200. You are directed to make payment within 30 days failing which further action will be initiated.'">${escapeAttr(workspace.sourceText || "")}</textarea>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="interpret-btn" id="interpret-notice-btn" style="flex:1" type="button" ${workspace.loading ? "disabled" : ""}>
              <span>${workspace.loading ? "Analyzing notice..." : "Interpret this notice"}</span>
              <span>-&gt;</span>
            </button>
            <button class="interpret-btn" id="load-sample-notice-btn" style="background:var(--bg4);color:var(--text2);border:1px solid var(--border2);flex:0" type="button" ${workspace.loading ? "disabled" : ""}>Load sample</button>
          </div>
          ${workspace.noticeMessage ? `<div class="auth-toast ${workspace.noticeError ? "auth-toast-error" : ""}">${workspace.noticeMessage}</div>` : ""}
        </div>
        <div class="notice-result notice-result-rich">
          ${interpretation ? `
            <div class="notice-output-rich">
              <div class="notice-summary-head">
                <div>
                  <div class="notice-title">${escapeHtml(interpretation.noticeType || "Regulatory notice")}</div>
                  <div class="notice-subtitle">${escapeHtml(interpretation.authority || "Authority not clearly identified")}</div>
                </div>
                <div class="notice-confidence">${confidencePercent}% confidence</div>
              </div>
              <div class="notice-card-grid">
                <div class="notice-card">
                  <div class="ni-label">Urgency</div>
                  <div class="ni-val ${interpretation.urgency === "critical" || interpretation.urgency === "high" ? "urgent" : "ok"}">${escapeHtml(interpretation.urgency || "medium")}</div>
                </div>
                <div class="notice-card">
                  <div class="ni-label">Response deadline</div>
                  <div class="ni-val ${interpretation.responseDeadline ? "urgent" : ""}">${escapeHtml(interpretation.responseDeadline || "Not clearly stated")}</div>
                </div>
              </div>
              <div class="ni-row"><div class="ni-label">Summary</div><div class="ni-val">${escapeHtml(interpretation.summary || "No summary returned.")}</div></div>
              <div class="ni-row"><div class="ni-label">Plain English meaning</div><div class="ni-val">${escapeHtml(interpretation.plainEnglishMeaning || "No plain-language explanation returned.")}</div></div>
              <div class="ni-row"><div class="ni-label">Why you received this</div><div class="ni-val">${escapeHtml(interpretation.whyReceived || "Reason not clearly visible in the notice.")}</div></div>
              <div class="ni-row"><div class="ni-label">Business impact</div><div class="ni-val">${escapeHtml(interpretation.businessImpact || "Business impact is unclear from the uploaded notice.")}</div></div>
              <div class="ni-row"><div class="ni-label">Financial exposure</div><div class="ni-val urgent">${escapeHtml(interpretation.financialExposure || "No financial exposure clearly stated.")}</div></div>
              <div class="ni-row"><div class="ni-label">Operational risk</div><div class="ni-val">${escapeHtml(interpretation.operationalRisk || "No operational risk clearly stated.")}</div></div>
              <div class="ni-row"><div class="ni-label">Key amounts</div><div class="notice-chip-row">${amountsMarkup}</div></div>
              <div class="ni-row"><div class="ni-label">Key sections / references</div><div class="notice-chip-row">${sectionsMarkup}</div></div>
              <div class="notice-list-grid">
                <div class="notice-list-card">
                  <div class="ni-label">Required actions</div>
                  <ul class="notice-list">${requiredActionsMarkup}</ul>
                </div>
                <div class="notice-list-card">
                  <div class="ni-label">Immediate next steps</div>
                  <ul class="notice-list">${nextStepsMarkup}</ul>
                </div>
                <div class="notice-list-card">
                  <div class="ni-label">If ignored</div>
                  <ul class="notice-list">${ignoredMarkup}</ul>
                </div>
              </div>
              <div class="ni-row"><div class="ni-label">Professional help</div><div class="ni-val">${escapeHtml(interpretation.professionalHelp || "Consider getting a CA, CS, or legal review depending on the authority involved.")}</div></div>
            </div>
          ` : `
            <div class="notice-placeholder">
              <span class="notice-placeholder-icon">Notice</span>
              <div>Upload a PDF/image or paste notice text to get an AI-powered interpretation.</div>
            </div>
          `}
        </div>
      </div>
      <div class="notice-chat-panel">
        <div class="bill-table-title">Ask follow-up questions</div>
        <div class="bill-table-sub">Keep chatting about deadlines, penalties, director exposure, business impact, or what to do next.</div>
        <div class="notice-chat-log">${chatMarkup}</div>
        <div class="notice-chat-form">
          <textarea id="notice-chat-input" class="notice-chat-input" placeholder="Ask: How will this affect our business if we wait another 2 weeks?">${escapeAttr(workspace.questionInput || "")}</textarea>
          <button class="interpret-btn notice-chat-send" id="send-notice-chat-btn" type="button" ${workspace.chatLoading || !interpretation ? "disabled" : ""}>
            <span>${workspace.chatLoading ? "Thinking..." : "Ask AI"}</span>
            <span>-&gt;</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderBillScannerPanel(state) {
  const workspace = state.billWorkspace && typeof state.billWorkspace === "object" ? state.billWorkspace : {};
  const documents = workspace.documents || [];
  const transactions = workspace.transactions || [];
  const totalSpend = transactions.reduce((sum, entry) => sum + (Number(entry.grossAmount) || 0), 0);
  const totalTax = documents.reduce((sum, doc) => sum + (Number(doc.taxAmount) || 0), 0);
  const vendors = new Set(documents.map((doc) => doc.vendorName).filter(Boolean)).size;

  const documentsMarkup = documents.length ? documents.map((doc) => `
    <tr>
      <td>${doc.vendorName || "Unknown vendor"}</td>
      <td>${doc.invoiceNumber || "—"}</td>
      <td>${doc.invoiceDate || "—"}</td>
      <td>${doc.category || "General expense"}</td>
      <td>${doc.gstin || "—"}</td>
      <td>${formatCurrency(doc.totalAmount, doc.currency || "INR")}</td>
      <td>${Math.round((Number(doc.confidence) || 0) * 100)}%</td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="7" class="empty-table-cell">No bills stored yet. Scan your first invoice to build the ledger.</td>
    </tr>
  `;

  const transactionsMarkup = transactions.length ? transactions.map((entry) => `
    <tr>
      <td>${entry.invoiceDate || "—"}</td>
      <td>${entry.vendorName || "Unknown vendor"}</td>
      <td>${entry.description || "Scanned transaction"}</td>
      <td>${entry.category || "General expense"}</td>
      <td>${Number(entry.quantity) || 1}</td>
      <td>${formatCurrency(entry.baseAmount || 0)}</td>
      <td>${formatCurrency(entry.taxAmount || 0)}</td>
      <td>${formatCurrency(entry.grossAmount || 0)}</td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="8" class="empty-table-cell">Structured ledger entries will appear here after a bill scan.</td>
    </tr>
  `;

  return `
    <div class="demo-panel" id="tab-bills">
      <div class="eyebrow" style="margin-bottom:.5rem">AI-powered accounting capture</div>
      <h3 style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:var(--text);margin-bottom:1rem">Scan bills, extract transactions, and build your ledger automatically</h3>
      <p style="font-size:14px;color:var(--text2);line-height:1.7;margin-bottom:1.75rem;max-width:760px">Upload a bill, invoice image, or PDF and CompliSure will read the document, structure the purchase data, and save reusable bookkeeping entries for future automation.</p>

      <div class="bill-scan-grid">
      <div class="bill-upload-card">
          <div class="bill-upload-title">Document intake</div>
          <p class="bill-upload-copy">Accepts PDF, JPG, PNG, WEBP, and HEIC bills or invoices. AI extracts the data and stores it in your dashboard for future workflows.</p>
          <label class="bill-dropzone" for="bill-upload-input">
            <input id="bill-upload-input" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif" />
            <span class="bill-dropzone-icon">🧾</span>
            <span class="bill-dropzone-title">Choose a bill, invoice, or PDF</span>
            <span class="bill-dropzone-sub">${workspace.selectedFileName || "No file selected yet"}</span>
          </label>
          <button class="btn-green bill-scan-btn" id="scan-bill-btn" type="button" ${workspace.scanLoading ? "disabled" : ""}>${workspace.scanLoading ? "Scanning..." : "Scan and store in ledger"} <span>→</span></button>
          <p class="bill-upload-note">This stores normalized vendor, tax, and line-item data in the app ledger so later features can reuse it.</p>
          ${workspace.scanMessage ? `<div class="auth-toast ${workspace.scanError ? "auth-toast-error" : ""}">${workspace.scanMessage}</div>` : ""}
        </div>

        <div class="bill-summary-grid">
          <div class="bill-summary-card">
            <div class="bill-summary-label">Bills stored</div>
            <div class="bill-summary-value">${documents.length}</div>
            <div class="bill-summary-sub">Scanned source documents</div>
          </div>
          <div class="bill-summary-card">
            <div class="bill-summary-label">Transactions captured</div>
            <div class="bill-summary-value">${transactions.length}</div>
            <div class="bill-summary-sub">Reusable ledger entries</div>
          </div>
          <div class="bill-summary-card">
            <div class="bill-summary-label">Spend tracked</div>
            <div class="bill-summary-value">${formatCurrency(totalSpend)}</div>
            <div class="bill-summary-sub">Gross value across stored bills</div>
          </div>
          <div class="bill-summary-card">
            <div class="bill-summary-label">Tax captured</div>
            <div class="bill-summary-value">${formatCurrency(totalTax)}</div>
            <div class="bill-summary-sub">${vendors} vendor${vendors === 1 ? "" : "s"} recognized</div>
          </div>
        </div>
      </div>

      <div class="bill-table-card">
        <div class="bill-table-header">
          <div>
            <div class="bill-table-title">Stored bills</div>
            <div class="bill-table-sub">Document-level summary for every scanned invoice or receipt.</div>
          </div>
        </div>
        <div class="bill-table-wrap">
          <table class="bill-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Category</th>
                <th>GSTIN</th>
                <th>Total</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>${documentsMarkup}</tbody>
          </table>
        </div>
      </div>

      <div class="bill-table-card">
        <div class="bill-table-header">
          <div>
            <div class="bill-table-title">Ledger transactions</div>
            <div class="bill-table-sub">Line-item level transactions extracted from scanned bills for future automation.</div>
          </div>
        </div>
        <div class="bill-table-wrap">
          <table class="bill-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Vendor</th>
                <th>Description</th>
                <th>Category</th>
                <th>Qty</th>
                <th>Base</th>
                <th>Tax</th>
                <th>Gross</th>
              </tr>
            </thead>
            <tbody>${transactionsMarkup}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderWhatsappPanel(reminders) {
  return `
    <div class="demo-panel" id="tab-whatsapp">
      <div class="eyebrow" style="margin-bottom:.5rem">Non-negotiable for Indian SMEs</div>
      <h3 style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:var(--text);margin-bottom:1.75rem">WhatsApp + Email Reminder System (FR-07)</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;align-items:start">
        <div>
          <p style="font-size:14px;color:var(--text2);line-height:1.7;margin-bottom:1rem">Configure owner + CA recipients and dispatch FR-07 triggers. Email delivery uses Resend for triggers where channel includes Email.</p>
          <div class="wa-config-card">
            <div class="wa-config-head">
              <strong>Reminder Config</strong>
              <span class="wa-status-pill" id="reminder-status-pill">Checking Resend status...</span>
            </div>
            <div class="wa-config-grid">
              <div class="field" style="margin-bottom:0">
                <label for="rem-owner-email">Owner email</label>
                <input id="rem-owner-email" type="text" value="${escapeAttr(reminders.ownerEmail)}" placeholder="founder@company.com" />
              </div>
              <div class="field" style="margin-bottom:0">
                <label for="rem-ca-email">CA email</label>
                <input id="rem-ca-email" type="text" value="${escapeAttr(reminders.caEmail)}" placeholder="ca@firm.com" />
              </div>
              <div class="field" style="margin-bottom:0">
                <label for="rem-obligation-name">Obligation</label>
                <input id="rem-obligation-name" type="text" value="${escapeAttr(reminders.obligationName)}" />
              </div>
              <div class="field" style="margin-bottom:0">
                <label for="rem-due-date">Due date</label>
                <input id="rem-due-date" type="date" value="${escapeAttr(reminders.dueDate)}" />
              </div>
              <div class="field" style="margin-bottom:0">
                <label for="rem-trigger-select">Trigger</label>
                <select id="rem-trigger-select">
                  <option value="30_days_before" ${reminders.trigger === "30_days_before" ? "selected" : ""}>30 days before due date</option>
                  <option value="7_days_before" ${reminders.trigger === "7_days_before" ? "selected" : ""}>7 days before due date</option>
                  <option value="3_days_before" ${reminders.trigger === "3_days_before" ? "selected" : ""}>3 days before due date</option>
                  <option value="due_date" ${reminders.trigger === "due_date" ? "selected" : ""}>Due date (Day 0)</option>
                  <option value="1_day_after_due" ${reminders.trigger === "1_day_after_due" ? "selected" : ""}>1 day after due date</option>
                  <option value="event_new_obligation" ${reminders.trigger === "event_new_obligation" ? "selected" : ""}>Event triggered (new obligation)</option>
                </select>
              </div>
            </div>
            <button class="wa-dispatch-btn" id="dispatch-reminder-btn" type="button">Dispatch reminder now</button>
            <div class="wa-helper-text">Resend env: <code>RESEND_API_KEY</code>, <code>RESEND_FROM_EMAIL</code>. Optional fallback: <code>REMINDER_ALLOW_DRY_RUN=true</code>.</div>
            <div id="reminder-dispatch-result" class="wa-dispatch-result" style="display:none"></div>
          </div>
          <div class="wa-schedule-table">
            <div class="wa-s-row wa-s-head"><span>Trigger</span><span>Recipient</span><span>Channel</span><span>Action</span></div>
            <div class="wa-s-row"><span>30d before</span><span>Owner + CA</span><span>WhatsApp + Email</span><span>View deadline details</span></div>
            <div class="wa-s-row"><span>7d before</span><span>Owner + CA</span><span>WhatsApp + Email</span><span>View deadline details</span></div>
            <div class="wa-s-row"><span>3d before</span><span>Owner + CA</span><span>WhatsApp + Push</span><span>Mark filed / Escalate</span></div>
            <div class="wa-s-row"><span>Due date</span><span>Owner + CA</span><span>WhatsApp + Push + Email</span><span>Mark as filed</span></div>
            <div class="wa-s-row"><span>+1 day</span><span>Owner only</span><span>WhatsApp + Push</span><span>See penalty calculator</span></div>
            <div class="wa-s-row"><span>New obligation</span><span>Owner + CA</span><span>WhatsApp + Push</span><span>View new obligation</span></div>
          </div>
        </div>
        <div class="wa-demo">
          <div class="wa-header">
            <div class="wa-icon">CS</div>
            <div><div class="wa-name">CompliSure</div><div class="wa-status">Online</div></div>
          </div>
          <div class="wa-bubble">
            <strong>3 days remaining</strong><br />
            <strong>GSTR-3B</strong> is due on <strong>20 May 2026</strong>.<br /><br />
            Penalty if missed: Rs 50/day (min Rs 1,000)<br />
            CA status: Not yet started
          </div>
          <div class="wa-time">Today � 9:00 AM</div>
          <div class="wa-actions">
            <button class="wa-action-btn" data-wa-action="filed" type="button">Mark as filed</button>
            <button class="wa-action-btn" data-wa-action="remind" type="button">Remind CA</button>
            <button class="wa-action-btn" data-wa-action="penalty" type="button">See penalty</button>
          </div>
          <div id="wa-response" style="margin-top:10px;display:none"></div>
        </div>
      </div>
    </div>
  `;
}

function renderStatusOptions(status) {
  return `
    <option value="overdue" ${status === "overdue" ? "selected" : ""}>Overdue</option>
    <option value="inprogress" ${status === "inprogress" ? "selected" : ""}>In progress</option>
    <option value="pending" ${status === "pending" ? "selected" : ""}>Not started</option>
    <option value="filed" ${status === "filed" ? "selected" : ""}>Filed</option>
  `;
}

function renderCaPortal(state) {
  const rows = state.caRows || [];
  const caPortal = state.caPortal || {};
  const form = caPortal.form || {};
  const rowsMarkup = rows.length ? rows.map((row, index) => `
    <div class="ca-row">
      <div>
        <div class="ca-client">${escapeHtml(row.client)}</div>
        <div class="ca-dept" style="font-size:11px;color:var(--text3)">${escapeHtml(row.filing)}</div>
      </div>
      <div class="ca-dept">${escapeHtml(row.dept)}</div>
      <div class="ca-deadline due-${row.dueTone}">${escapeHtml(row.due || "Date not set")}</div>
      <select class="ca-status-sel" data-row-index="${index}" ${caPortal.saving ? "disabled" : ""}>${renderStatusOptions(row.status)}</select>
    </div>
  `).join("") : `
    <div class="ca-empty-state">No filings stored for this workspace yet. Add your first client obligation below.</div>
  `;

  return `
    <div class="demo-panel" id="tab-ca">
      <div class="eyebrow" style="margin-bottom:.5rem">Qdrant-backed multi-client dashboard</div>
      <h3 style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:var(--text);margin-bottom:1rem">Your entire client portfolio - one working pane</h3>
      <p style="font-size:14px;color:var(--text2);line-height:1.7;margin-bottom:1.5rem;max-width:760px">The CA portal now persists filings in Qdrant Cloud so status changes, refreshes, and new obligations are stored as live data instead of static demo rows.</p>

      <div class="ca-form-card">
        <div class="ca-form-head">
          <div>
            <div class="bill-upload-title">Add client obligation</div>
            <div class="bill-upload-copy">Create a filing row for a client and track it from overdue to filed.</div>
          </div>
          <div class="ca-form-actions">
            <button class="btn-outline ca-secondary-btn" id="refresh-ca-rows-btn" type="button" ${caPortal.hydrating || caPortal.saving ? "disabled" : ""}>${caPortal.hydrating ? "Refreshing..." : "Refresh"}</button>
            <button class="btn-green ca-primary-btn" id="add-ca-row-btn" type="button" ${caPortal.saving ? "disabled" : ""}>${caPortal.saving ? "Saving..." : "Add filing"} <span>→</span></button>
          </div>
        </div>
        <div class="ca-form-grid">
          <div class="field" style="margin-bottom:0">
            <label for="ca-client-input">Client name</label>
            <input id="ca-client-input" type="text" value="${escapeAttr(form.client || "")}" placeholder="Zephyr Tech Pvt Ltd" />
          </div>
          <div class="field" style="margin-bottom:0">
            <label for="ca-filing-input">Filing / obligation</label>
            <input id="ca-filing-input" type="text" value="${escapeAttr(form.filing || "")}" placeholder="GSTR-3B - April" />
          </div>
          <div class="field" style="margin-bottom:0">
            <label for="ca-dept-input">Department</label>
            <input id="ca-dept-input" type="text" value="${escapeAttr(form.dept || "")}" placeholder="GST" />
          </div>
          <div class="field" style="margin-bottom:0">
            <label for="ca-due-date-input">Due date</label>
            <input id="ca-due-date-input" type="date" value="${escapeAttr(form.dueDate || "")}" />
          </div>
        </div>
        ${caPortal.message ? `<div class="auth-toast ${caPortal.error ? "auth-toast-error" : ""}" style="margin-top:1rem">${escapeHtml(caPortal.message)}</div>` : ""}
      </div>

      <div class="ca-dash">
        <div class="ca-dash-header">
          <div class="ca-title">Pending items across all clients <span class="ca-badge-count" id="pending-count">${rows.filter((row) => ["overdue", "pending"].includes(row.status)).length} urgent</span></div>
          <button id="mark-all-filed-btn" style="background:var(--green-bg);color:var(--green);border:1px solid rgba(34,197,94,.25);padding:7px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif" type="button" ${caPortal.saving || !rows.length ? "disabled" : ""}>Mark all filed</button>
        </div>
        <div class="ca-row-head">
          <span>Client / Filing</span><span>Dept</span><span>Due date</span><span>Status</span>
        </div>
        <div id="ca-rows">${rowsMarkup}</div>
      </div>
    </div>
  `;
}

export function renderLiveTools(state) {
  const reminders = state.reminders || {
    ownerEmail: "",
    caEmail: "",
    obligationName: "GSTR-3B - Monthly Return",
    dueDate: "",
    trigger: "7_days_before"
  };
  const isDetailsOnlyLogin = Boolean(state.flags?.detailsOnlyLogin);
  const toolsSubtitle = isDetailsOnlyLogin
    ? "Your dashboard is currently open in temporary direct-access mode. The live tools are available now, and Aadhaar OTP can be turned back on later."
    : "The live tools have moved out of the public landing page. Once Aadhaar OTP verification is done, the full toolset opens here.";

  return `
    <section id="tools" style="padding-top:5rem">
      <div class="wrap">
        <div class="eyebrow">Live tools</div>
        <h2 class="sec-title">Your verified dashboard toolkit</h2>
        <p class="sec-sub">${toolsSubtitle}</p>
        <div class="demo-area">
          <div class="demo-tabs">
            <div class="demo-tab active" data-tab="onboard">Smart onboarding</div>
            <div class="demo-tab" data-tab="penalty">Penalty calculator</div>
            <div class="demo-tab" data-tab="notice">Notice interpreter</div>
            <div class="demo-tab" data-tab="bills">Bill scanner</div>
            <div class="demo-tab" data-tab="whatsapp">WhatsApp reminders</div>
            <div class="demo-tab" data-tab="ca">CA portal</div>
          </div>
          ${onboardingPanel}
          ${penaltyPanel}
          ${renderNoticePanel(state)}
          ${renderBillScannerPanel(state)}
          ${renderWhatsappPanel(reminders)}
          ${renderCaPortal(state)}
        </div>
      </div>
    </section>
  `;
}
