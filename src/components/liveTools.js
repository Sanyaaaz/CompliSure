const onboardingPanel = `
  <div class="demo-panel active" id="tab-onboard">
    <div class="eyebrow" style="margin-bottom:.5rem">6 questions · your personal compliance universe</div>
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
          <div class="radio-btn" data-val="1-9">1–9</div>
          <div class="radio-btn" data-val="10-19">10–19</div>
          <div class="radio-btn" data-val="20-99">20–99</div>
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
      <button class="gen-btn" id="generate-calendar-btn" type="button">Generate my compliance calendar →</button>
    </div>
    <div class="calendar-output" id="cal-output">
      <div class="cal-heading" id="cal-heading">Your compliance calendar — 2026–27</div>
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
            <option value="MGT-7">MGT-7 — Annual Return (MCA)</option>
            <option value="AOC-4">AOC-4 — Financial Statements (MCA)</option>
            <option value="DPT-3">DPT-3 — Return of Deposits</option>
            <option value="GSTR-3B">GSTR-3B — Monthly GST Return</option>
            <option value="ITR">ITR — Income Tax Return</option>
            <option value="TDS">TDS Return (26Q / 24Q)</option>
            <option value="PF">PF Challan</option>
            <option value="ESI">ESI Challan</option>
            <option value="DIR-12">DIR-12 — Director Change</option>
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
            <option value="small">Small company (&lt;₹2Cr turnover)</option>
          </select>
        </div>
        <button class="calc-btn" id="calculate-penalty-btn" type="button">Calculate penalty →</button>
      </div>
      <div class="result-col" id="pen-result-col">
        <div style="text-align:center;color:var(--text3);padding:2rem 0">
          <div style="font-size:2rem;margin-bottom:.75rem">📊</div>
          <div style="font-size:14px">Select a filing and days overdue</div>
        </div>
      </div>
    </div>
  </div>
`;

const noticePanel = `
  <div class="demo-panel" id="tab-notice">
    <div class="eyebrow" style="margin-bottom:.5rem">AI-powered · plain language</div>
    <h3 style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:var(--text);margin-bottom:1.75rem">Paste any government notice — get an instant explanation</h3>
    <div class="notice-grid">
      <div class="notice-input-area">
        <textarea class="notice-ta" id="notice-text" placeholder="Paste notice text here…

Example: 'This is to inform that your company M/s ABC Pvt Ltd (CIN: U72200KA2021PTC134567) has failed to file Form MGT-7 for the financial year 2022-23 within the prescribed time. A penalty of ₹100 per day has been levied under Section 92(5) of the Companies Act 2013. The total outstanding amount is ₹18,200. You are directed to make payment within 30 days failing which further action will be initiated.'"></textarea>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="interpret-btn" id="interpret-notice-btn" style="flex:1" type="button">
            <span>Interpret this notice</span>
            <span>→</span>
          </button>
          <button class="interpret-btn" id="load-sample-notice-btn" style="background:var(--bg4);color:var(--text2);border:1px solid var(--border2);flex:0" type="button">Load sample</button>
        </div>
      </div>
      <div class="notice-result" id="notice-result">
        <div class="notice-placeholder">
          <span class="notice-placeholder-icon">📋</span>
          <div>Paste a notice to get an instant plain-language breakdown</div>
        </div>
        <div class="notice-output" id="notice-output"></div>
      </div>
    </div>
  </div>
`;

function formatCurrency(value, currency = "INR") {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(amount);
}

function renderBillScannerPanel(state) {
  const workspace = state.billWorkspace;
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
      <div class="eyebrow" style="margin-bottom:.5rem">Gemini-powered accounting capture</div>
      <h3 style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:var(--text);margin-bottom:1rem">Scan bills, extract transactions, and build your ledger automatically</h3>
      <p style="font-size:14px;color:var(--text2);line-height:1.7;margin-bottom:1.75rem;max-width:760px">Upload a bill or invoice image and CompliSure will use Gemini to read the document, structure the purchase data, and save reusable bookkeeping entries for future automation.</p>

      <div class="bill-scan-grid">
        <div class="bill-upload-card">
          <div class="bill-upload-title">Document intake</div>
          <p class="bill-upload-copy">Accepts JPG, PNG, WEBP, and HEIC bill images. The extracted data is stored in your dashboard for later workflows.</p>
          <label class="bill-dropzone" for="bill-upload-input">
            <input id="bill-upload-input" type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" />
            <span class="bill-dropzone-icon">🧾</span>
            <span class="bill-dropzone-title">Choose a bill or invoice image</span>
            <span class="bill-dropzone-sub">${workspace.selectedFileName || "No file selected yet"}</span>
          </label>
          <button class="btn-green bill-scan-btn" id="scan-bill-btn" type="button" ${workspace.scanLoading ? "disabled" : ""}>${workspace.scanLoading ? "Scanning with Gemini..." : "Scan and store in ledger"} <span>→</span></button>
          <p class="bill-upload-note">This stores normalized vendor, tax, and line-item data locally so later features can reuse it.</p>
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

const whatsappPanel = `
  <div class="demo-panel" id="tab-whatsapp">
    <div class="eyebrow" style="margin-bottom:.5rem">Non-negotiable for Indian SMEs</div>
    <h3 style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:var(--text);margin-bottom:1.75rem">Reminders on the channels you actually check</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;align-items:start">
      <div>
        <p style="font-size:14px;color:var(--text2);line-height:1.7;margin-bottom:1.5rem">CompliSure sends alerts at 30, 7, and 3 days before each deadline — and again on the due date. Both you and your CA receive identical messages. Mark as filed directly from the chat, no app login required.</p>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:1.5rem">
          <div style="display:flex;gap:12px;align-items:center;padding:12px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:10px">
            <div style="width:8px;height:8px;border-radius:50%;background:var(--red);flex-shrink:0"></div>
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--text)">3 days before</div>
              <div style="font-size:12px;color:var(--text3)">WhatsApp + Push — Mark filed / Escalate to CA</div>
            </div>
          </div>
          <div style="display:flex;gap:12px;align-items:center;padding:12px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:10px">
            <div style="width:8px;height:8px;border-radius:50%;background:var(--amber);flex-shrink:0"></div>
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--text)">7 days before</div>
              <div style="font-size:12px;color:var(--text3)">WhatsApp + Email — Both owner and CA alerted</div>
            </div>
          </div>
          <div style="display:flex;gap:12px;align-items:center;padding:12px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:10px">
            <div style="width:8px;height:8px;border-radius:50%;background:var(--green);flex-shrink:0"></div>
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--text)">30 days before</div>
              <div style="font-size:12px;color:var(--text3)">WhatsApp + Email — Early heads-up, plan ahead</div>
            </div>
          </div>
        </div>
      </div>
      <div class="wa-demo">
        <div class="wa-header">
          <div class="wa-icon">CS</div>
          <div><div class="wa-name">CompliSure</div><div class="wa-status">● Online</div></div>
        </div>
        <div class="wa-bubble">
          <strong>⚠️ 3 days remaining</strong><br />
          <strong>GSTR-3B</strong> for April is due on <strong>20 May 2026</strong>.<br /><br />
          Penalty if missed: ₹50/day (min ₹1,000)<br />
          Your CA: Rajesh Mehta &amp; Co — Not yet started
        </div>
        <div class="wa-time">Today · 9:00 AM</div>
        <div class="wa-actions">
          <button class="wa-action-btn" data-wa-action="filed" type="button">✓ Mark as filed</button>
          <button class="wa-action-btn" data-wa-action="remind" type="button">📣 Remind CA</button>
          <button class="wa-action-btn" data-wa-action="penalty" type="button">📊 See penalty</button>
        </div>
        <div id="wa-response" style="margin-top:10px;display:none"></div>
      </div>
    </div>
  </div>
`;

function renderStatusOptions(status) {
  return `
    <option value="overdue" ${status === "overdue" ? "selected" : ""}>Overdue</option>
    <option value="inprogress" ${status === "inprogress" ? "selected" : ""}>In progress</option>
    <option value="pending" ${status === "pending" ? "selected" : ""}>Not started</option>
    <option value="filed" ${status === "filed" ? "selected" : ""}>Filed ✓</option>
  `;
}

export function renderLiveTools(state) {
  const rowsMarkup = state.caRows.map((row, index) => `
    <div class="ca-row">
      <div><div class="ca-client">${row.client}</div><div class="ca-dept" style="font-size:11px;color:var(--text3)">${row.filing}</div></div>
      <div class="ca-dept">${row.dept}</div>
      <div class="ca-deadline due-${row.dueTone}">${row.due}</div>
      <select class="ca-status-sel" data-row-index="${index}">${renderStatusOptions(row.status)}</select>
    </div>
  `).join("");

  return `
    <section id="tools" style="padding-top:5rem">
      <div class="wrap">
        <div class="eyebrow">Live tools</div>
        <h2 class="sec-title">Your verified dashboard toolkit</h2>
        <p class="sec-sub">The live tools have moved out of the public landing page. Once Aadhaar OTP verification is done, the full toolset opens here.</p>
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
          ${noticePanel}
          ${renderBillScannerPanel(state)}
          ${whatsappPanel}
          <div class="demo-panel" id="tab-ca">
            <div class="eyebrow" style="margin-bottom:.5rem">Multi-client dashboard</div>
            <h3 style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:var(--text);margin-bottom:1.75rem">Your entire client portfolio — one pane</h3>
            <div class="ca-dash">
              <div class="ca-dash-header">
                <div class="ca-title">Pending items across all clients <span class="ca-badge-count" id="pending-count">4 urgent</span></div>
                <button id="mark-all-filed-btn" style="background:var(--green-bg);color:var(--green);border:1px solid rgba(34,197,94,.25);padding:7px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif" type="button">Mark selected filed</button>
              </div>
              <div class="ca-row-head">
                <span>Client / Filing</span><span>Dept</span><span>Due date</span><span>Status</span>
              </div>
              <div id="ca-rows">${rowsMarkup}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}
