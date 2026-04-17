import { renderLiveTools } from "./liveTools.js";
import { renderFooter } from "./sections.js";

export function renderDashboardPage(state) {
  const digits = String(state.auth?.aadhaarDigits ?? "");
  const aadhaarLast4 = digits.slice(-4);
  const verifiedName = state.auth.verificationProfile?.name || state.auth.fullName || "Founder";
  const isDetailsOnlyLogin = Boolean(state.flags?.detailsOnlyLogin);
  const identityTitle = isDetailsOnlyLogin ? "Access mode" : "Identity verification";
  const identityValue = isDetailsOnlyLogin
    ? aadhaarLast4
      ? `Details-only access •••• ${aadhaarLast4}`
      : "Details-only access"
    : `Aadhaar •••• ${aadhaarLast4}`;
  const verificationNote = isDetailsOnlyLogin
    ? "Temporary details-only login mode is active. Aadhaar verification is currently bypassed."
    : state.auth.verificationProfile?.fullAddress
      ? `Verified via Aadhaar OTP · ${state.auth.verificationProfile.fullAddress}`
      : "Verified through Aadhaar-linked mobile OTP";
  const heroTag = isDetailsOnlyLogin
    ? "Temporary access mode · Aadhaar verification paused"
    : "Aadhaar OTP verified · dashboard unlocked";
  const heroCopy = isDetailsOnlyLogin
    ? "Your workspace is open in temporary details-only mode. The live tools stay available, and the Aadhaar verification flow remains in the codebase to be re-enabled later."
    : "Your verified workspace is live. The public landing page no longer exposes the tools — they now sit inside this dashboard after OTP verification.";
  const assistant = state.assistant || {};
  const assistantHistory = Array.isArray(assistant.history) ? assistant.history : [];
  const assistantMessagesMarkup = assistantHistory.length
    ? assistantHistory.map((message) => `
      <div class="ai-chat-msg ${message.role === "user" ? "user" : "assistant"}">
        <div>${escapeHtml(message.content || "")}</div>
        ${Array.isArray(message.upcomingTasks) && message.upcomingTasks.length ? `<ul>${message.upcomingTasks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      </div>
    `).join("")
    : `<div class="ai-chat-empty">Ask about compliance deadlines, filings, penalties, or what to do next.</div>`;

  const pw = state.policyWatch || {};
  const policyAlerts = Array.isArray(pw.alerts) ? pw.alerts : [];
  const seen = new Set(pw.seenIds || []);
  const policyNewCount = policyAlerts.filter((a) => a.id && !seen.has(a.id)).length;
  const scanLabel = pw.scannedAt
    ? (() => {
      const d = new Date(pw.scannedAt);
      return Number.isNaN(d.getTime()) ? String(pw.scannedAt) : d.toLocaleString();
    })()
    : "";

  const mode = pw.agentMode || "";
  const agentLabel = mode === "agent"
    ? "Last run used an agentic loop: the model called tools to list feeds, fetch RSS, then submit ranked alerts."
    : mode === "fallback"
      ? "Last run used the fallback pipeline: batch RSS fetch plus a single AI ranking pass (e.g. agent incomplete or POLICY_USE_AGENTIC=false)."
      : mode
        ? `Last run mode: ${mode}`
        : "";
  const agentTraceJson = Array.isArray(pw.agentTrace) && pw.agentTrace.length
    ? escapeHtml(JSON.stringify(pw.agentTrace, null, 2))
    : "";

  const sa = pw.situationAnalysis || {};
  const situationSummary = String(sa.situationSummary || "").trim();
  const postureRaw = String(sa.compliancePosture || "").toLowerCase();
  const postureKnown = ["strong", "fair", "strained", "critical", "unknown"].includes(postureRaw);
  const postureLabel = postureKnown
    ? postureRaw.charAt(0).toUpperCase() + postureRaw.slice(1)
    : "";
  const postureClass = postureKnown ? `policy-posture--${postureRaw}` : "policy-posture--unknown";
  const riskHotspots = Array.isArray(sa.riskHotspots) ? sa.riskHotspots.filter((x) => String(x || "").trim()) : [];
  const policyHints = Array.isArray(sa.policyInterpretationHints)
    ? sa.policyInterpretationHints.filter((x) => String(x || "").trim())
    : [];
  const hasSituationBlock =
    Boolean(situationSummary) ||
    Boolean(postureLabel) ||
    riskHotspots.length > 0 ||
    policyHints.length > 0;

  const situationMarkup = hasSituationBlock
    ? `
        <div class="policy-situation-card">
          <div class="policy-situation-head">
            <h3 class="policy-situation-title">Current business situation</h3>
            ${postureLabel ? `<span class="policy-posture ${postureClass}">${escapeHtml(postureLabel)}</span>` : ""}
          </div>
          <p class="policy-situation-meta">From your workspace snapshot in Qdrant plus live CA workload when you scan—used to tailor policy impact below.</p>
          ${situationSummary ? `<p class="policy-situation-sum">${escapeHtml(situationSummary)}</p>` : ""}
          ${riskHotspots.length ? `
          <div class="policy-situation-block">
            <div class="policy-situation-k">Risk hotspots</div>
            <ul class="policy-situation-ul">${riskHotspots.map((line) => `<li>${escapeHtml(String(line))}</li>`).join("")}</ul>
          </div>` : ""}
          ${policyHints.length ? `
          <div class="policy-situation-block">
            <div class="policy-situation-k">What to watch in new circulars</div>
            <ul class="policy-situation-ul">${policyHints.map((line) => `<li>${escapeHtml(String(line))}</li>`).join("")}</ul>
          </div>` : ""}
        </div>`
    : "";

  const policyListMarkup = policyAlerts.length
    ? policyAlerts.map((a) => {
      const isNew = a.id && !seen.has(a.id);
      const risk = String(a.riskLevel || "medium").toLowerCase();
      const riskClass = risk === "high" ? "policy-risk--high" : risk === "low" ? "policy-risk--low" : "policy-risk--mid";
      const depts = Array.isArray(a.departments) && a.departments.length
        ? `<span class="policy-depts">${a.departments.map((d) => `<span class="policy-dept">${escapeHtml(d)}</span>`).join("")}</span>`
        : "";
      const url = String(a.url || "").trim();
      const safeUrl = /^https?:\/\//i.test(url) ? url : "";
      const impactText = String(a.businessImpact || a.whyRelevant || "").trim();
      const actions = Array.isArray(a.suggestedActions) ? a.suggestedActions.filter((x) => String(x || "").trim()) : [];
      const actionsMarkup = actions.length
        ? `<ul class="policy-action-list">${actions.map((line) => `<li>${escapeHtml(String(line))}</li>`).join("")}</ul>`
        : "";
      const whyExtra = a.whyRelevant && impactText && String(a.whyRelevant).trim() !== impactText
        ? `<p class="policy-radar-why">${escapeHtml(a.whyRelevant)}</p>`
        : "";
      return `
        <li class="policy-radar-item ${isNew ? "policy-radar-item--new" : ""}">
          <div class="policy-radar-item-top">
            <span class="policy-risk ${riskClass}">${escapeHtml(risk)}</span>
            ${isNew ? '<span class="policy-new-pill">New</span>' : ""}
            ${a.relevanceScore != null ? `<span class="policy-score">${Math.round(Number(a.relevanceScore) * 100)}% match</span>` : ""}
          </div>
          <div class="policy-radar-title2">${escapeHtml(a.title || "Notice")}</div>
          ${impactText ? `
          <div class="policy-impact-block">
            <div class="policy-impact-label">Impact on your business</div>
            <p class="policy-impact-text">${escapeHtml(impactText)}</p>
          </div>` : ""}
          ${whyExtra}
          ${actionsMarkup ? `<div class="policy-actions-wrap"><div class="policy-actions-label">Suggested next steps</div>${actionsMarkup}</div>` : ""}
          ${a.summary ? `<p class="policy-radar-sum"><span class="policy-sum-k">Source excerpt</span> ${escapeHtml(a.summary)}</p>` : ""}
          <div class="policy-radar-meta">
            <span>${escapeHtml(a.source || "")}</span>
            ${a.published ? `<span>${escapeHtml(a.published)}</span>` : ""}
            ${depts}
          </div>
          ${safeUrl ? `<a class="policy-radar-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">Open official source →</a>` : ""}
        </li>`;
    }).join("")
    : `<li class="policy-radar-empty">No personalised alerts yet. Run a scan to pull the latest RSS items and rank them for your profile.</li>`;

  return `
    <div class="app-shell dashboard-shell">
      <nav>
        <a class="logo" href="#">Compli<span>Sure</span></a>
        <ul class="nav-links">
          <li><a href="#overview">Overview</a></li>
          <li><a href="#policy-radar">Policy radar${policyNewCount ? ` <span class="nav-badge">${policyNewCount}</span>` : ""}</a></li>
          <li><a href="#tools">Live tools</a></li>
          <li><a href="#identity">Identity</a></li>
        </ul>
        <button class="nav-btn nav-btn-logout" id="logout-btn" type="button">Log out</button>
      </nav>

      <section class="hero dashboard-hero" id="overview">
        <div class="hero-glow"></div>
        <div class="hero-tag"><span class="hero-tag-dot"></span>${heroTag}</div>
        <h1>Welcome back,<br /><span class="accent">${verifiedName}</span></h1>
        <p class="hero-sub">${heroCopy}</p>
        <div class="dash-grid">
          <div class="dash-card">
            <div class="dash-card-label">Company</div>
            <div class="dash-card-value">${state.auth.companyName || "CompliSure Account"}</div>
            <div class="dash-card-sub">Primary operating entity</div>
          </div>
          <div class="dash-card" id="identity">
            <div class="dash-card-label">${identityTitle}</div>
            <div class="dash-card-value">${identityValue}</div>
            <div class="dash-card-sub">${verificationNote}</div>
          </div>
          <div class="dash-card">
            <div class="dash-card-label">Access state</div>
            <div class="dash-card-value">Dashboard open</div>
            <div class="dash-card-sub">${isDetailsOnlyLogin ? "Opened from entered details while verification is paused" : "Protected until OTP verification succeeds"}</div>
          </div>
        </div>
        <div class="dash-health-wrap" id="dash-health-wrap"></div>
      </section>

      <section class="policy-radar-section" id="policy-radar">
        <div class="policy-radar-hero">
          <div>
            <div class="eyebrow">Government &amp; regulators</div>
            <h2 class="sec-title policy-radar-h2">Policy radar</h2>
            <p class="policy-radar-lead">
              By default the brain runs an <strong>agentic</strong> scan: the model uses <strong>tools</strong> to list configured RSS URLs, fetch the ones it needs (allowlisted), and submit final alerts tailored to your profile—otherwise it falls back to a batch fetch plus one ranking step.
              Extend feeds with <code class="policy-code">POLICY_RSS_FEEDS</code> in <code class="policy-code">.env</code>. Always verify on the issuing authority’s site.
            </p>
          </div>
          <div class="policy-radar-actions">
            <button class="btn-green policy-scan-btn" id="policy-watch-scan-btn" type="button" ${pw.loading ? "disabled" : ""}>${pw.loading ? "Scanning feeds…" : "Scan official feeds"}</button>
            <button class="btn-outline policy-seen-btn" id="policy-watch-seen-btn" type="button" ${policyAlerts.length ? "" : "disabled"}>Mark all read</button>
          </div>
        </div>
        ${situationMarkup}
        ${policyNewCount ? `<div class="policy-radar-banner" role="status"><span class="policy-radar-banner-dot"></span> ${policyNewCount} new alert${policyNewCount === 1 ? "" : "s"} since you last marked read</div>` : ""}
        ${pw.error ? `<div class="policy-radar-error">${escapeHtml(pw.error)}</div>` : ""}
        ${pw.lastMessage ? `<div class="policy-radar-note">${escapeHtml(pw.lastMessage)}</div>` : ""}
        <ul class="policy-radar-list">${policyListMarkup}</ul>
        ${agentLabel ? `<p class="policy-agent-mode">${escapeHtml(agentLabel)}</p>` : ""}
        ${agentTraceJson ? `<details class="policy-agent-trace"><summary>Tool trace (technical)</summary><pre class="policy-agent-pre">${agentTraceJson}</pre></details>` : ""}
        <p class="policy-radar-foot">
          ${pw.scannedAt ? `Last scan: ${escapeHtml(scanLabel)}` : "No scan yet — run a check to populate alerts."}
        </p>
      </section>

      ${renderLiveTools(state)}
      <div class="ai-chat-fab-shell ${assistant.open ? "open" : ""}">
        <button id="ai-chat-toggle-btn" class="ai-chat-toggle-btn" type="button">${assistant.open ? "Close AI" : "AI Assistant"}</button>
        <div class="ai-chat-panel">
          <div class="ai-chat-header">Compliance AI Assistant</div>
          <div class="ai-chat-log" id="ai-chat-log">${assistantMessagesMarkup}</div>
          ${assistant.message ? `<div class="ai-chat-status ${assistant.error ? "error" : ""}">${escapeHtml(assistant.message)}</div>` : ""}
          <div class="ai-chat-form">
            <textarea id="ai-chat-input" placeholder="Ask a compliance question...">${escapeAttr(assistant.input || "")}</textarea>
            <button id="ai-chat-send-btn" type="button" ${assistant.loading ? "disabled" : ""}>${assistant.loading ? "Thinking..." : "Send"}</button>
          </div>
        </div>
      </div>
      ${renderFooter()}
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
