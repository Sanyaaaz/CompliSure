import { COMPLIANCE_DB, DEFAULT_CA_ROWS, NOTICE_PATTERNS, PENALTY_DATA, SAMPLE_NOTICE } from "./data.js";
import { renderDashboardPage } from "./components/dashboardPage.js";
import { renderLandingPage } from "./components/landingPage.js";

const root = document.getElementById("app");

function createDefaultAuthState() {
  return {
    fullName: "",
    companyName: "",
    aadhaarDisplay: "",
    aadhaarDigits: "",
    consent: false,
    otpSent: false,
    otpInput: "",
    referenceId: "",
    verificationProfile: null,
    verified: false,
    message: "",
    messageType: "info",
    loading: false,
    loadingStep: ""
  };
}

const savedSession = readSession();

const state = {
  view: savedSession?.verified ? "dashboard" : "landing",
  auth: savedSession ? { ...createDefaultAuthState(), ...savedSession, otpSent: false, otpInput: "", referenceId: "", message: "", messageType: "info", loading: false, loadingStep: "" } : createDefaultAuthState(),
  caRows: DEFAULT_CA_ROWS.map((row) => ({ ...row }))
};

renderApp();

function renderApp() {
  root.innerHTML = state.view === "dashboard" ? renderDashboardPage(state) : renderLandingPage(state);
  bindCommonEvents();
  if (state.view === "landing") {
    bindSignupEvents();
  } else {
    bindDashboardEvents();
    bindLiveToolEvents();
    initializeCaStatusStyles();
  }
}

function bindCommonEvents() {
  document.querySelectorAll("[data-alert]").forEach((button) => {
    button.addEventListener("click", () => {
      window.alert(button.dataset.alert || "Coming soon.");
    });
  });
}

function bindSignupEvents() {
  const aadhaarInput = document.getElementById("aadhaar-number");
  const consent = document.getElementById("aadhaar-consent");
  const sendOtpButton = document.getElementById("send-otp-btn");
  const verifyOtpButton = document.getElementById("verify-otp-btn");
  const editSignupButton = document.getElementById("edit-signup-btn");
  const otpInput = document.getElementById("otp-input");
  const founderInput = document.getElementById("founder-name");
  const companyInput = document.getElementById("company-name");

  [founderInput, companyInput].forEach((input) => {
    input?.addEventListener("input", syncSignupFormToState);
  });

  aadhaarInput?.addEventListener("input", () => {
    const digits = normalizeDigits(aadhaarInput.value).slice(0, 12);
    state.auth.aadhaarDigits = digits;
    state.auth.aadhaarDisplay = formatAadhaar(digits);
    aadhaarInput.value = state.auth.aadhaarDisplay;
  });

  consent?.addEventListener("change", syncSignupFormToState);
  otpInput?.addEventListener("input", () => {
    state.auth.otpInput = normalizeDigits(otpInput.value).slice(0, 6);
    otpInput.value = state.auth.otpInput;
  });

  sendOtpButton?.addEventListener("click", handleSendOtp);
  verifyOtpButton?.addEventListener("click", handleVerifyOtp);
  editSignupButton?.addEventListener("click", () => {
    syncSignupFormToState();
    state.auth.otpSent = false;
    state.auth.referenceId = "";
    state.auth.otpInput = "";
    state.auth.message = "";
    state.auth.loading = false;
    state.auth.loadingStep = "";
    renderApp();
    scrollToId("signup");
  });
}

function syncSignupFormToState() {
  const founderField = document.getElementById("founder-name");
  const companyField = document.getElementById("company-name");
  const consentField = document.getElementById("aadhaar-consent");
  const aadhaarField = document.getElementById("aadhaar-number");
  const otpField = document.getElementById("otp-input");

  state.auth.fullName = founderField ? founderField.value.trim() : state.auth.fullName;
  state.auth.companyName = companyField ? companyField.value.trim() : state.auth.companyName;
  state.auth.consent = consentField ? consentField.checked : state.auth.consent;
  const digits = normalizeDigits(aadhaarField ? aadhaarField.value : state.auth.aadhaarDisplay).slice(0, 12);
  state.auth.aadhaarDigits = digits;
  state.auth.aadhaarDisplay = formatAadhaar(digits);
  const otp = otpField ? otpField.value : state.auth.otpInput;
  state.auth.otpInput = normalizeDigits(otp).slice(0, 6);
}

function handleSendOtp() {
  return handleSendOtpAsync();
}

async function handleSendOtpAsync() {
  syncSignupFormToState();

  if (!state.auth.fullName || !state.auth.companyName) {
    state.auth.message = "Enter founder and company details before requesting OTP.";
    state.auth.messageType = "error";
    renderApp();
    scrollToId("signup");
    return;
  }

  if (state.auth.aadhaarDigits.length !== 12) {
    state.auth.message = "Enter a valid 12-digit Aadhaar number.";
    state.auth.messageType = "error";
    renderApp();
    scrollToId("signup");
    return;
  }

  if (!state.auth.consent) {
    state.auth.message = "Consent is required before OTP verification can start.";
    state.auth.messageType = "error";
    renderApp();
    scrollToId("signup");
    return;
  }

  state.auth.loading = true;
  state.auth.loadingStep = "send";
  state.auth.message = "";
  renderApp();

  try {
    const response = await postJson("/api/aadhaar/otp", {
      aadhaar: state.auth.aadhaarDigits,
      consent: state.auth.consent,
      fullName: state.auth.fullName,
      companyName: state.auth.companyName
    });

    state.auth.loading = false;
    state.auth.loadingStep = "";
    state.auth.otpSent = true;
    state.auth.referenceId = response.referenceId || "";
    state.auth.messageType = "info";
    state.auth.message = response.message || "OTP sent to the Aadhaar-linked mobile number.";
    renderApp();
    scrollToId("signup");
  } catch (error) {
    state.auth.loading = false;
    state.auth.loadingStep = "";
    state.auth.otpSent = false;
    state.auth.referenceId = "";
    state.auth.messageType = "error";
    state.auth.message = error.message || "Could not send Aadhaar OTP.";
    renderApp();
    scrollToId("signup");
  }
}

function handleVerifyOtp() {
  return handleVerifyOtpAsync();
}

async function handleVerifyOtpAsync() {
  syncSignupFormToState();

  if (!state.auth.otpSent) {
    state.auth.message = "Request an OTP first.";
    state.auth.messageType = "error";
    renderApp();
    scrollToId("signup");
    return;
  }

  if (state.auth.otpInput.length < 4) {
    state.auth.message = "Enter the OTP sent to the Aadhaar-linked mobile number.";
    state.auth.messageType = "error";
    renderApp();
    scrollToId("signup");
    return;
  }

  if (!state.auth.referenceId) {
    state.auth.message = "Missing Aadhaar verification reference. Please request OTP again.";
    state.auth.messageType = "error";
    renderApp();
    scrollToId("signup");
    return;
  }

  state.auth.loading = true;
  state.auth.loadingStep = "verify";
  state.auth.message = "";
  renderApp();

  try {
    const response = await postJson("/api/aadhaar/verify", {
      aadhaar: state.auth.aadhaarDigits,
      consent: state.auth.consent,
      fullName: state.auth.fullName,
      companyName: state.auth.companyName,
      otp: state.auth.otpInput,
      referenceId: state.auth.referenceId
    });

    state.auth.loading = false;
    state.auth.loadingStep = "";
    state.auth.verified = true;
    state.auth.otpSent = false;
    state.auth.verificationProfile = response.verifiedProfile || null;
    state.auth.message = response.message || "";
    state.view = "dashboard";
    persistSession();
    renderApp();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    state.auth.loading = false;
    state.auth.loadingStep = "";
    state.auth.messageType = "error";
    state.auth.message = error.message || "OTP verification failed.";
    renderApp();
    scrollToId("signup");
  }
}

function bindDashboardEvents() {
  const logoutButton = document.getElementById("logout-btn");
  logoutButton?.addEventListener("click", () => {
    clearSession();
    state.view = "landing";
    state.auth = createDefaultAuthState();
    state.caRows = DEFAULT_CA_ROWS.map((row) => ({ ...row }));
    renderApp();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function bindLiveToolEvents() {
  document.querySelectorAll(".demo-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".demo-tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".demo-panel").forEach((panel) => panel.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${tab.dataset.tab}`)?.classList.add("active");
    });
  });

  document.querySelectorAll(".radio-group").forEach((group) => {
    group.querySelectorAll(".radio-btn").forEach((button) => {
      button.addEventListener("click", () => {
        group.querySelectorAll(".radio-btn").forEach((item) => item.classList.remove("sel"));
        button.classList.add("sel");
      });
    });
  });

  document.getElementById("generate-calendar-btn")?.addEventListener("click", generateCalendar);
  document.getElementById("calculate-penalty-btn")?.addEventListener("click", calculatePenalty);
  document.getElementById("load-sample-notice-btn")?.addEventListener("click", () => {
    const textarea = document.getElementById("notice-text");
    if (textarea) {
      textarea.value = SAMPLE_NOTICE;
    }
  });
  document.getElementById("interpret-notice-btn")?.addEventListener("click", interpretNotice);

  document.querySelectorAll("[data-wa-action]").forEach((button) => {
    button.addEventListener("click", () => handleWhatsappAction(button.dataset.waAction));
  });

  document.querySelectorAll(".ca-status-sel").forEach((select) => {
    select.addEventListener("change", () => {
      const rowIndex = Number(select.dataset.rowIndex);
      state.caRows[rowIndex].status = select.value;
      applyStatusStyle(select, select.value);
      updatePendingCount();
    });
  });

  document.getElementById("mark-all-filed-btn")?.addEventListener("click", () => {
    document.querySelectorAll(".ca-status-sel").forEach((select) => {
      select.value = "filed";
      const rowIndex = Number(select.dataset.rowIndex);
      state.caRows[rowIndex].status = "filed";
      applyStatusStyle(select, "filed");
    });
    updatePendingCount();
  });
}

function generateCalendar() {
  const type = document.getElementById("co-type")?.value || "";
  const stateCode = document.getElementById("co-state")?.value || "";
  const employeeBand = document.querySelector("#emp-group .radio-btn.sel")?.dataset.val || "";
  const gst = document.querySelector("#gst-group .radio-btn.sel")?.dataset.val || "none";
  const deposits = document.querySelector("#dep-group .radio-btn.sel")?.dataset.val || "no";

  if (!type || !stateCode || !employeeBand) {
    window.alert("Please complete all fields before generating.");
    return;
  }

  let items = [...COMPLIANCE_DB.base];
  if (gst === "regular") items = [...items, ...COMPLIANCE_DB.gst_regular];
  if (gst === "composition") items = [...items, ...COMPLIANCE_DB.gst_composition];
  if (["1-9", "10-19", "20-99", "100+"].includes(employeeBand)) items = [...items, ...COMPLIANCE_DB.emp_1_9];
  if (["10-19", "20-99", "100+"].includes(employeeBand)) items = [...items, ...COMPLIANCE_DB.emp_10plus];
  if (["20-99", "100+"].includes(employeeBand)) items = [...items, ...COMPLIANCE_DB.emp_20plus];
  if (deposits === "yes") items = [...items, ...COMPLIANCE_DB.deposits];
  const stateKey = `state_${stateCode}`;
  if (COMPLIANCE_DB[stateKey]) items = [...items, ...COMPLIANCE_DB[stateKey]];

  const itemsContainer = document.getElementById("cal-items");
  const output = document.getElementById("cal-output");
  const heading = document.getElementById("cal-heading");
  const summary = document.getElementById("cal-summary");

  if (!itemsContainer || !output || !heading || !summary) return;

  itemsContainer.innerHTML = items.map((item) => `
    <div class="cal-row">
      <div class="dot dot-${item.urgency}"></div>
      <div class="cal-info">
        <div class="cal-name">${item.name}${item.dir ? ' <span class="dir-tag">DIR LIABILITY</span>' : ""}</div>
        <div class="cal-dept">${item.dept}</div>
      </div>
      <div class="cal-due">${item.due}</div>
      <div class="cal-pen pen-${item.urgency === "g" ? "a" : item.urgency}">${item.pen}</div>
    </div>
  `).join("");
  heading.textContent = `Your compliance calendar · ${items.length} items personalised`;
  summary.textContent = `✓ ${items.length} obligations identified for your profile (${type.toUpperCase()} · ${stateCode} · ${employeeBand} employees · GST: ${gst}). Out of 180+ total, only these apply to you.`;
  output.style.display = "block";
  output.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function calculatePenalty() {
  const form = document.getElementById("pen-form")?.value || "";
  const days = Number.parseInt(document.getElementById("pen-days")?.value || "1", 10) || 1;
  const result = document.getElementById("pen-result-col");

  if (!form || !result) {
    window.alert("Please select a filing.");
    return;
  }

  const details = PENALTY_DATA[form];
  if (!details) return;

  const current = details.base + details.daily * days;
  const in7 = details.base + details.daily * (days + 7);
  const in30 = details.base + details.daily * (days + 30);
  const cap = (value) => (details.max ? Math.min(value, details.max) : value);
  const formatCurrency = (value) => `₹${Math.round(cap(value)).toLocaleString("en-IN")}`;
  const width = Math.min(100, Math.round((cap(current) / Math.max(cap(in30), 1)) * 100));

  result.innerHTML = `
    <div class="penalty-amount">${formatCurrency(current)}</div>
    <div class="penalty-label">${days} day${days !== 1 ? "s" : ""} overdue · ${form}</div>
    <div class="pen-bar-label" style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Penalty escalation</div>
    <div class="pen-bar-track"><div class="pen-bar-fill" style="width:${width}%"></div></div>
    <div class="pen-timeline">
      <div class="pen-t-row"><span class="pen-t-label">Today (${days} days overdue)</span><span class="pen-t-val">${formatCurrency(current)}</span></div>
      <div class="pen-t-row"><span class="pen-t-label">In 7 more days</span><span class="pen-t-val">${formatCurrency(in7)}</span></div>
      <div class="pen-t-row"><span class="pen-t-label">In 30 more days</span><span class="pen-t-val">${formatCurrency(in30)}</span></div>
    </div>
    ${details.dir ? `<div class="dir-badge">⚡ Director personally liable for this penalty</div>` : ""}
    <div style="margin-top:1rem;font-size:12px;color:var(--text3);line-height:1.5">${details.note}${details.max ? ` · Capped at ₹${details.max.toLocaleString("en-IN")}` : ""}</div>
  `;
}

function interpretNotice() {
  const textarea = document.getElementById("notice-text");
  const result = document.getElementById("notice-result");
  const output = document.getElementById("notice-output");
  const placeholder = result?.querySelector(".notice-placeholder");
  const text = textarea?.value.trim() || "";

  if (!text || !result || !output || !placeholder) {
    window.alert("Please paste a notice to interpret.");
    return;
  }

  placeholder.style.display = "none";
  output.style.display = "block";
  output.innerHTML = `<div style="display:flex;justify-content:center;padding:2rem"><div class="loading-dots"><span></span><span></span><span></span></div></div>`;

  window.setTimeout(() => {
    const match = NOTICE_PATTERNS.find((pattern) => pattern.pattern.test(text));
    const penaltyMatches = text.match(/₹[\d,]+/g);
    const penalty = penaltyMatches ? penaltyMatches[0] : "Amount not specified";
    const responseDays = text.match(/(\d+)\s*days/i);
    const responseWindow = responseDays ? `${responseDays[1]} days` : "As specified";

    if (!match) {
      output.innerHTML = `
        <div class="ni-row"><div class="ni-label">Notice type</div><div class="ni-val">Regulatory / Compliance notice</div></div>
        <div class="ni-row"><div class="ni-label">Amount mentioned</div><div class="ni-val urgent">${penalty}</div></div>
        <div class="ni-row"><div class="ni-label">Response deadline</div><div class="ni-val urgent">${responseWindow}</div></div>
        <div class="ni-row"><div class="ni-label">Recommended action</div><div class="ni-val">Consult your CA or CS immediately with this notice</div></div>
        <div class="ni-row"><div class="ni-label">Urgency</div><div class="ni-val urgent">HIGH — Do not ignore</div></div>
        <div style="margin-top:1rem;padding:10px 14px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.2);border-radius:8px;font-size:12px;color:var(--amber)">Note: CompliSure provides general guidance only. This is not legal advice — please consult a qualified professional for complex notices.</div>
      `;
      return;
    }

    output.innerHTML = `
      <div class="ni-row"><div class="ni-label">Notice type</div><div class="ni-val">${match.type}</div></div>
      <div class="ni-row"><div class="ni-label">Why you received this</div><div class="ni-val">${match.reason}</div></div>
      <div class="ni-row"><div class="ni-label">Amount outstanding</div><div class="ni-val urgent">${penalty}</div></div>
      <div class="ni-row"><div class="ni-label">Required action</div><div class="ni-val">${match.action}</div></div>
      <div class="ni-row"><div class="ni-label">Response deadline</div><div class="ni-val urgent">${match.deadline || responseWindow}</div></div>
      <div class="ni-row"><div class="ni-label">Urgency level</div><div class="ni-val ${match.urgency.includes("CRITICAL") ? "urgent" : "ok"}">${match.urgency}</div></div>
      <div class="ni-row"><div class="ni-label">Professional needed?</div><div class="ni-val">${match.ca}</div></div>
      <div style="margin-top:1rem;padding:10px 14px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.2);border-radius:8px;font-size:12px;color:var(--amber)">CompliSure provides general guidance only — not legal advice. Consult your CA or CS before responding to any notice.</div>
    `;
  }, 900);
}

function handleWhatsappAction(action) {
  const response = document.getElementById("wa-response");
  if (!response) return;

  const messages = {
    filed: `<div class="wa-bubble sent">✓ Filed<div class="wa-time">Just now</div></div><div class="wa-bubble" style="margin-top:6px">Great! GSTR-3B marked as filed. I've notified your CA and updated your calendar. Your compliance score has been updated.<div class="wa-time">Just now</div></div>`,
    remind: `<div class="wa-bubble sent">📣 Remind CA<div class="wa-time">Just now</div></div><div class="wa-bubble" style="margin-top:6px">Done! A separate alert has been sent to Rajesh Mehta &amp; Co. If they don't act within 7 days, you'll receive an escalation alert automatically.<div class="wa-time">Just now</div></div>`,
    penalty: `<div class="wa-bubble sent">📊 See penalty<div class="wa-time">Just now</div></div><div class="wa-bubble" style="margin-top:6px"><strong>GSTR-3B penalty if missed:</strong><br />After due date: ₹50/day<br />After 10 days: ₹500+<br />After 30 days: ₹1,500+<br />Max penalty: ₹5,000 per return<div class="wa-time">Just now</div></div>`
  };

  response.style.display = "block";
  response.innerHTML = messages[action] || "";
}

function initializeCaStatusStyles() {
  document.querySelectorAll(".ca-status-sel").forEach((select) => {
    applyStatusStyle(select, select.value);
  });
  updatePendingCount();
}

function applyStatusStyle(select, value) {
  const colors = {
    overdue: { background: "var(--red-bg)", color: "var(--red)", border: "rgba(239,68,68,.25)" },
    inprogress: { background: "var(--amber-bg)", color: "var(--amber)", border: "rgba(245,158,11,.25)" },
    filed: { background: "var(--green-bg)", color: "var(--green)", border: "rgba(34,197,94,.25)" },
    pending: { background: "var(--bg3)", color: "var(--text3)", border: "var(--border)" }
  };

  const style = colors[value] || colors.pending;
  select.style.background = style.background;
  select.style.color = style.color;
  select.style.border = `1px solid ${style.border}`;
}

function updatePendingCount() {
  const urgentStatuses = ["overdue", "pending"];
  const count = state.caRows.filter((row) => urgentStatuses.includes(row.status)).length;
  const badge = document.getElementById("pending-count");
  if (badge) {
    badge.textContent = `${count} urgent`;
  }
}

function normalizeDigits(value) {
  return value.replace(/\D/g, "");
}

function formatAadhaar(digits) {
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.error || data.message || data.detail || `Request failed with ${response.status}.`);
  }

  return data;
}

function persistSession() {
  localStorage.setItem("complisure-session", JSON.stringify({
    verified: true,
    fullName: state.auth.fullName,
    companyName: state.auth.companyName,
    aadhaarDigits: state.auth.aadhaarDigits,
    aadhaarDisplay: state.auth.aadhaarDisplay,
    verificationProfile: state.auth.verificationProfile,
    consent: true
  }));
}

function readSession() {
  try {
    const raw = localStorage.getItem("complisure-session");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem("complisure-session");
}

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
