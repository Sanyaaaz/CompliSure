export function renderProblemSection() {
  return `
    <section style="padding-top:4rem">
      <div class="wrap">
        <div class="eyebrow">The problem</div>
        <h2 class="sec-title">The compliance system is broken for founders</h2>
        <div class="bento">
          <div class="bento-card bento-c1">
            <div class="bento-icon icon-red">📋</div>
            <div class="bento-title">No single source of truth</div>
            <p class="bento-body">MCA, GSTN, and Income Tax each have separate portals, logins, and calendars. Nothing aggregates them for your specific company profile.</p>
          </div>
          <div class="bento-card bento-c2">
            <div class="bento-icon icon-amber">⚠️</div>
            <div class="bento-title">Event-triggered filings are invisible — until they cost you</div>
            <p class="bento-body">Hiring your 10th employee, accepting a director deposit, opening a branch — each triggers new filings nobody tells you about. The DPT-3 penalty is real: a Bengaluru startup accepted ₹5L from a director and had no idea DPT-3 existed.</p>
            <div class="penalty-pill">⚡ DPT-3 missed → ₹47,000 penalty · compounding daily · Director personally liable</div>
          </div>
          <div class="bento-card bento-c3">
            <div class="bento-icon icon-blue">👤</div>
            <div class="bento-title">Your CA is a single point of failure</div>
            <p class="bento-body">Your CA manages 200+ clients with Excel spreadsheets and WhatsApp groups. No audit trail, no escalation system, no shared accountability. One missed filing damages your relationship and costs you lakhs.</p>
          </div>
          <div class="bento-card bento-c4">
            <div class="bento-icon icon-green">📄</div>
            <div class="bento-title">Government notices are unreadable</div>
            <p class="bento-body">When a demand letter arrives, founders have no idea what it means or what to do. Legal consultations cost more time than the filing itself.</p>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderFeaturesSection() {
  return `
    <section id="features">
      <div class="wrap">
        <div class="eyebrow">Platform features</div>
        <h2 class="sec-title">Everything compliance, start to proof</h2>
        <p class="sec-sub">CompliSure solves the three layers no existing tool addresses together: discovery, personalisation, and accountability.</p>
        <div class="feat-grid">
          <div class="feat-tile"><div class="feat-num">01</div><div class="feat-title">Smart onboarding</div><p class="feat-desc">6 questions generate your personalised compliance universe — 30–45 items, not 180+ — in under 30 seconds.</p><span class="feat-chip chip-g">Core · P0</span></div>
          <div class="feat-tile"><div class="feat-num">02</div><div class="feat-title">Master compliance calendar</div><p class="feat-desc">Single-pane calendar across MCA, GST, Income Tax, Labour. Colour-coded urgency with penalty preview on every item.</p><span class="feat-chip chip-g">Core · P0</span></div>
          <div class="feat-tile"><div class="feat-num">03</div><div class="feat-title">Event-triggered engine</div><p class="feat-desc">Log a business event — hiring, deposit, director change — and new obligations surface automatically with deadlines.</p><span class="feat-chip chip-a">Differentiator</span></div>
          <div class="feat-tile"><div class="feat-num">04</div><div class="feat-title">CA collaboration layer</div><p class="feat-desc">Invite your CA with one link. Both receive identical alerts. You see filing status in real time — no chasing.</p><span class="feat-chip chip-b">Shared accountability</span></div>
          <div class="feat-tile"><div class="feat-num">05</div><div class="feat-title">Penalty calculator</div><p class="feat-desc">Live compounding penalty for any overdue filing — today, +7 days, +30 days — with director liability flags.</p><span class="feat-chip chip-r">Urgency</span></div>
          <div class="feat-tile"><div class="feat-num">06</div><div class="feat-title">Notice interpreter</div><p class="feat-desc">Paste any government notice. Get a plain-language explanation: what it means, why you received it, what to do by when.</p><span class="feat-chip chip-b">AI-powered</span></div>
          <div class="feat-tile"><div class="feat-num">07</div><div class="feat-title">WhatsApp reminders</div><p class="feat-desc">Alerts at 30, 7, 3 days and on due date via WhatsApp. Mark as filed directly from the message.</p><span class="feat-chip chip-g">Non-negotiable</span></div>
          <div class="feat-tile"><div class="feat-num">08</div><div class="feat-title">Document vault</div><p class="feat-desc">Centralised storage for all filed forms and government notices. Searchable and linked to calendar items.</p><span class="feat-chip chip-b">Storage</span></div>
          <div class="feat-tile"><div class="feat-num">09</div><div class="feat-title">Compliance health score</div><p class="feat-desc">A 0–100 score across MCA, GST, Labour, and Tax — with one-click investor-ready PDF report.</p><span class="feat-chip chip-a">Due diligence</span></div>
        </div>
      </div>
    </section>
  `;
}

export function renderScoreSection() {
  return `
    <section style="background:var(--bg2);border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
      <div class="wrap">
        <div class="eyebrow">Compliance health score</div>
        <h2 class="sec-title">Your compliance posture, quantified</h2>
        <p class="sec-sub">A single score useful for internal accountability — and essential for investor due diligence.</p>
        <div class="score-split">
          <div class="score-card">
            <div class="score-big">
              <div class="score-ring-wrap">
                <svg viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r="40" fill="none" stroke="#1F1F23" stroke-width="8"></circle>
                  <circle cx="48" cy="48" r="40" fill="none" stroke="#22C55E" stroke-width="8" stroke-dasharray="175 251" stroke-dashoffset="62" stroke-linecap="round"></circle>
                </svg>
                <div class="score-num-inside">74</div>
              </div>
              <div>
                <div class="score-meta-title">Good standing</div>
                <div class="score-meta-sub">Updated Apr 17, 2026</div>
              </div>
            </div>
            <div class="score-bar-row"><div class="sbr-label">MCA</div><div class="sbr-track"><div class="sbr-fill" style="width:88%;background:#22C55E"></div></div><div class="sbr-val">88</div></div>
            <div class="score-bar-row"><div class="sbr-label">GST</div><div class="sbr-track"><div class="sbr-fill" style="width:79%;background:#22C55E"></div></div><div class="sbr-val">79</div></div>
            <div class="score-bar-row"><div class="sbr-label">Labour</div><div class="sbr-track"><div class="sbr-fill" style="width:62%;background:#F59E0B"></div></div><div class="sbr-val">62</div></div>
            <div class="score-bar-row"><div class="sbr-label">Tax</div><div class="sbr-track"><div class="sbr-fill" style="width:71%;background:#22C55E"></div></div><div class="sbr-val">71</div></div>
            <div class="score-actions-list">
              <div class="sal-title">What's dragging your score</div>
              <div class="sal-item">ESI registration overdue · Labour · +15 pts if resolved</div>
              <div class="sal-item">PT challan Q4 unpaid · +7 pts</div>
              <div class="sal-item">2 items without proof uploaded · +5 pts</div>
            </div>
          </div>
          <div>
            <div class="report-preview">
              <div class="rp-header">
                <div>
                  <div class="rp-logo">CompliSure</div>
                  <div class="rp-title">Investor Readiness Report</div>
                </div>
                <div>
                  <div class="rp-company">Zephyr Tech Pvt Ltd</div>
                  <div style="font-size:11px;color:var(--text3)">CIN: U72200KA2021PTC134567</div>
                </div>
              </div>
              <div class="rp-row"><span class="rp-key">Compliance health score</span><span class="rp-val good">74 / 100</span></div>
              <div class="rp-row"><span class="rp-key">Filings on time (12 months)</span><span class="rp-val good">41 of 44</span></div>
              <div class="rp-row"><span class="rp-key">Pending penalty exposure</span><span class="rp-val bad">₹18,200</span></div>
              <div class="rp-row"><span class="rp-key">Director liability flags</span><span class="rp-val bad">2 active</span></div>
              <div class="rp-row"><span class="rp-key">Document vault coverage</span><span class="rp-val">88%</span></div>
              <div class="rp-row"><span class="rp-key">Report generated</span><span class="rp-val">Apr 17, 2026</span></div>
              <button class="rp-dl-btn" data-alert="In the live product, this generates a branded PDF instantly.">Download investor PDF report →</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderPricingSection() {
  return `
    <section id="pricing">
      <div class="wrap">
        <div style="text-align:center;margin-bottom:.5rem"><div class="eyebrow" style="display:inline-block">Pricing</div></div>
        <h2 class="sec-title" style="text-align:center;margin:0 auto">Simple, transparent plans</h2>
        <p class="sec-sub" style="text-align:center;margin:1rem auto 0">No surprises. CAs always get a free account. Cancel any time.</p>
        <div class="pricing-grid">
          <div class="p-card">
            <div class="p-tier">Starter</div>
            <div class="p-amount">Free</div>
            <div class="p-period">Forever, one company</div>
            <hr class="p-divider" />
            <ul class="p-features">
              <li>Personalised compliance calendar</li>
              <li>30-day email reminders</li>
              <li>5 event-triggered checks</li>
              <li>Basic health score</li>
              <li>Document vault (500 MB)</li>
            </ul>
            <button class="p-btn p-btn-dark" data-alert="Early access signup coming soon!">Get started free</button>
          </div>
          <div class="p-card featured">
            <div class="p-badge">Most popular</div>
            <div class="p-tier">Professional</div>
            <div class="p-amount">₹999</div>
            <div class="p-period">/ month · billed annually</div>
            <hr class="p-divider" />
            <ul class="p-features">
              <li>Everything in Starter</li>
              <li>WhatsApp reminders (30/7/3 days)</li>
              <li>Unlimited event-triggered checks</li>
              <li>CA collaboration layer</li>
              <li>Live penalty calculator</li>
              <li>Notice interpreter (AI)</li>
              <li>Investor readiness report</li>
              <li>Document vault (2 GB)</li>
              <li>All 28 states coverage</li>
            </ul>
            <button class="p-btn p-btn-green" data-alert="Start your 14-day free trial — no card required.">Start free trial →</button>
          </div>
          <div class="p-card" id="ca">
            <div class="p-tier">CA / CS Firm</div>
            <div class="p-amount">₹2,499</div>
            <div class="p-period">/ month · up to 50 clients</div>
            <hr class="p-divider" />
            <ul class="p-features">
              <li>Multi-client dashboard</li>
              <li>All Professional features per client</li>
              <li>Priority pending items view</li>
              <li>CA-branded reminder messages</li>
              <li>Bulk CSV export</li>
              <li>Full audit trail with timestamps</li>
              <li>Dedicated onboarding</li>
            </ul>
            <button class="p-btn p-btn-dark" data-alert="Talk to our team for a demo tailored to your firm.">Talk to us</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderCtaBand() {
  return `
    <section class="cta-band">
      <div class="eyebrow" style="color:rgba(0,0,0,.5);margin-bottom:.75rem">Get started today</div>
      <h2>Stop finding out about filings from penalty notices.</h2>
      <p>Aadhaar signup, OTP verification, and your personalised dashboard in minutes.</p>
      <a class="btn-dark" href="#signup">Sign up with Aadhaar →</a>
      <div class="sub-note">OTP access required before dashboard unlocks</div>
    </section>
  `;
}

export function renderFooter() {
  return `
    <footer>
      <div class="footer-inner">
        <a class="footer-logo" href="#">Compli<span>Sure</span></a>
        <div class="footer-links">
          <a href="#">Privacy policy</a>
          <a href="#">Terms of service</a>
          <a href="#">Regulatory disclaimer</a>
          <a href="#">Contact</a>
        </div>
        <div class="footer-copy">© 2026 CompliSure. Confidential &amp; Proprietary.</div>
      </div>
    </footer>
  `;
}
