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
    </div>
    <div class="calendar-output" id="cal-output">
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

const noticePanel = `
  <div class="demo-panel" id="tab-notice">
    <div class="eyebrow" style="margin-bottom:.5rem">AI-powered - plain language</div>
    <h3 style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:var(--text);margin-bottom:1.75rem">Paste any government notice - get an instant explanation</h3>
    <div class="notice-grid">
      <div class="notice-input-area">
        <textarea class="notice-ta" id="notice-text" placeholder="Paste notice text here...

Example: 'This is to inform that your company M/s ABC Pvt Ltd (CIN: U72200KA2021PTC134567) has failed to file Form MGT-7 for the financial year 2022-23 within the prescribed time. A penalty of Rs100 per day has been levied under Section 92(5) of the Companies Act 2013. The total outstanding amount is Rs18,200. You are directed to make payment within 30 days failing which further action will be initiated.'"></textarea>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="interpret-btn" id="interpret-notice-btn" style="flex:1" type="button">
            <span>Interpret this notice</span>
            <span>-&gt;</span>
          </button>
          <button class="interpret-btn" id="load-sample-notice-btn" style="background:var(--bg4);color:var(--text2);border:1px solid var(--border2);flex:0" type="button">Load sample</button>
        </div>
      </div>
      <div class="notice-result" id="notice-result">
        <div class="notice-placeholder">
          <span class="notice-placeholder-icon">Notice</span>
          <div>Paste a notice to get an instant plain-language breakdown</div>
        </div>
        <div class="notice-output" id="notice-output"></div>
      </div>
    </div>
  </div>
`;

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
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
          <div class="wa-time">Today · 9:00 AM</div>
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

export function renderLiveTools(state) {
  const rowsMarkup = state.caRows.map((row, index) => `
    <div class="ca-row">
      <div><div class="ca-client">${row.client}</div><div class="ca-dept" style="font-size:11px;color:var(--text3)">${row.filing}</div></div>
      <div class="ca-dept">${row.dept}</div>
      <div class="ca-deadline due-${row.dueTone}">${row.due}</div>
      <select class="ca-status-sel" data-row-index="${index}">${renderStatusOptions(row.status)}</select>
    </div>
  `).join("");

  const reminders = state.reminders || {
    ownerEmail: "",
    caEmail: "",
    obligationName: "GSTR-3B - Monthly Return",
    dueDate: "",
    trigger: "7_days_before"
  };

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
            <div class="demo-tab" data-tab="whatsapp">WhatsApp reminders</div>
            <div class="demo-tab" data-tab="ca">CA portal</div>
          </div>
          ${onboardingPanel}
          ${penaltyPanel}
          ${noticePanel}
          ${renderWhatsappPanel(reminders)}
          <div class="demo-panel" id="tab-ca">
            <div class="eyebrow" style="margin-bottom:.5rem">Multi-client dashboard</div>
            <h3 style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:var(--text);margin-bottom:1.75rem">Your entire client portfolio - one pane</h3>
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
