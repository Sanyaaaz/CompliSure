import { COMPLIANCE_DB, PENALTY_DATA, SAMPLE_NOTICE } from "./data.js";
import { renderDashboardPage } from "./components/dashboardPage.js";
import { renderLandingPage } from "./components/landingPage.js";

const root = document.getElementById("app");
// Temporary switch to let the team continue testing while Aadhaar verification is paused.
const TEMPORARY_DETAILS_ONLY_LOGIN = true;

function createFlags() {
  return {
    detailsOnlyLogin: TEMPORARY_DETAILS_ONLY_LOGIN
  };
}

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

function createDefaultReminderState(session = null, saved = {}) {
  return {
    ownerName: saved.ownerName || session?.fullName || "",
    companyName: saved.companyName || session?.companyName || "",
    ownerEmail: saved.ownerEmail || "",
    caName: saved.caName || "Linked CA",
    caEmail: saved.caEmail || "",
    obligationName: saved.obligationName || "GSTR-3B - Monthly Return",
    dueDate: saved.dueDate || "",
    trigger: saved.trigger || "7_days_before"
  };
}

function createDefaultBillWorkspace(saved = {}) {
  return {
    documents: Array.isArray(saved.documents) ? saved.documents : [],
    transactions: Array.isArray(saved.transactions) ? saved.transactions : [],
    selectedFileName: "",
    scanMessage: "",
    scanError: false,
    scanLoading: false,
    hydrated: false,
    hydrating: false
  };
}

function createDefaultNoticeWorkspace(saved = {}) {
  return {
    sourceText: saved.sourceText || "",
    sourceLabel: saved.sourceLabel || "",
    selectedFileName: "",
    interpretation: saved.interpretation || null,
    chatHistory: Array.isArray(saved.chatHistory) ? saved.chatHistory : [],
    questionInput: "",
    noticeMessage: "",
    noticeError: false,
    loading: false,
    chatLoading: false
  };
}

function createDefaultCaPortalState() {
  return {
    message: "",
    error: false,
    saving: false,
    hydrating: false,
    hydrated: false,
    form: {
      client: "",
      filing: "",
      dept: "GST",
      dueDate: "",
      status: "pending"
    }
  };
}

const savedSession = readSession();

const state = {
  flags: createFlags(),
  view: savedSession?.verified ? "dashboard" : "landing",
  auth: savedSession ? { ...createDefaultAuthState(), ...savedSession, otpSent: false, otpInput: "", referenceId: "", message: "", messageType: "info", loading: false, loadingStep: "" } : createDefaultAuthState(),
  activeToolTab: "onboard",
  caRows: [],
  caPortal: createDefaultCaPortalState(),
  reminders: createDefaultReminderState(savedSession, readReminderProfile()),
  billWorkspace: createDefaultBillWorkspace(readBillWorkspace()),
  noticeWorkspace: createDefaultNoticeWorkspace(readNoticeWorkspace())
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
  const directDashboardButton = document.getElementById("direct-dashboard-btn");

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
  directDashboardButton?.addEventListener("click", handleDirectDashboardAccess);
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
    state.auth.message = "Enter founder and company details before continuing.";
    state.auth.messageType = "error";
    renderApp();
    scrollToId("signup");
    return;
  }

  if (!state.flags.detailsOnlyLogin && state.auth.aadhaarDigits.length !== 12) {
    state.auth.message = "Enter a valid 12-digit Aadhaar number.";
    state.auth.messageType = "error";
    renderApp();
    scrollToId("signup");
    return;
  }

  if (!state.flags.detailsOnlyLogin && !state.auth.consent) {
    state.auth.message = "Consent is required before OTP verification can start.";
    state.auth.messageType = "error";
    renderApp();
    scrollToId("signup");
    return;
  }

  if (state.flags.detailsOnlyLogin) {
    openDashboardWithoutOtp();
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

function handleDirectDashboardAccess() {
  syncSignupFormToState();

  if (!state.auth.fullName || !state.auth.companyName) {
    state.auth.message = "Enter founder and company details before continuing.";
    state.auth.messageType = "error";
    renderApp();
    scrollToId("signup");
    return;
  }

  openDashboardWithoutOtp();
}

function openDashboardWithoutOtp() {
  state.auth.verified = true;
  state.auth.otpSent = false;
  state.auth.referenceId = "";
  state.auth.otpInput = "";
  state.auth.verificationProfile = {
    name: state.auth.fullName,
    dateOfBirth: "",
    gender: "",
    fullAddress: "",
    referenceId: "details-only-bypass"
  };
  state.auth.messageType = "info";
  state.auth.message = "";
  state.view = "dashboard";
  persistSession();
  renderApp();
  window.scrollTo({ top: 0, behavior: "smooth" });
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
    state.flags = createFlags();
    state.activeToolTab = "onboard";
    state.caRows = [];
    state.caPortal = createDefaultCaPortalState();
    state.reminders = createDefaultReminderState(null, readReminderProfile());
    state.billWorkspace = createDefaultBillWorkspace(readBillWorkspace());
    state.noticeWorkspace = createDefaultNoticeWorkspace(readNoticeWorkspace());
    renderApp();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  hydrateBillWorkspaceFromServer();
  hydrateCaRowsFromServer();
}

function bindLiveToolEvents() {
  document.querySelectorAll(".demo-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeToolTab = tab.dataset.tab || "onboard";
      applyActiveToolTab();
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
  document.getElementById("notice-upload-input")?.addEventListener("change", handleNoticeFileSelection);
  document.getElementById("load-sample-notice-btn")?.addEventListener("click", () => {
    const textarea = document.getElementById("notice-text");
    if (textarea) {
      textarea.value = SAMPLE_NOTICE;
    }
    state.activeToolTab = "notice";
    state.noticeWorkspace.sourceText = SAMPLE_NOTICE;
    state.noticeWorkspace.selectedFileName = "";
    state.noticeWorkspace.sourceLabel = "Pasted notice text";
    state.noticeWorkspace.noticeMessage = "Sample notice loaded. Click interpret to analyze it with Groq.";
    state.noticeWorkspace.noticeError = false;
    renderApp();
  });
  document.getElementById("interpret-notice-btn")?.addEventListener("click", interpretNotice);
  document.getElementById("notice-chat-input")?.addEventListener("input", syncNoticeFormToState);
  document.getElementById("send-notice-chat-btn")?.addEventListener("click", handleNoticeChat);
  document.getElementById("bill-upload-input")?.addEventListener("change", handleBillFileSelection);
  document.getElementById("scan-bill-btn")?.addEventListener("click", handleBillScan);
  document.getElementById("ca-client-input")?.addEventListener("input", syncCaFormToState);
  document.getElementById("ca-filing-input")?.addEventListener("input", syncCaFormToState);
  document.getElementById("ca-dept-input")?.addEventListener("input", syncCaFormToState);
  document.getElementById("ca-due-date-input")?.addEventListener("input", syncCaFormToState);
  document.getElementById("add-ca-row-btn")?.addEventListener("click", handleAddCaRow);
  document.getElementById("refresh-ca-rows-btn")?.addEventListener("click", () => hydrateCaRowsFromServer(true));

  document.querySelectorAll("[data-wa-action]").forEach((button) => {
    button.addEventListener("click", () => handleWhatsappAction(button.dataset.waAction));
  });

  document.querySelectorAll(".ca-status-sel").forEach((select) => {
    select.addEventListener("change", () => {
      handleCaStatusChange(select);
    });
  });

  document.getElementById("mark-all-filed-btn")?.addEventListener("click", () => {
    handleMarkAllFiled();
  });

  bindReminderEvents();
  applyActiveToolTab();
}

function bindReminderEvents() {
  state.reminders.ownerName = state.auth.fullName || state.reminders.ownerName || "";
  state.reminders.companyName = state.auth.companyName || state.reminders.companyName || "";

  const ownerEmailInput = document.getElementById("rem-owner-email");
  const caEmailInput = document.getElementById("rem-ca-email");
  const obligationInput = document.getElementById("rem-obligation-name");
  const dueDateInput = document.getElementById("rem-due-date");
  const triggerSelect = document.getElementById("rem-trigger-select");
  const dispatchButton = document.getElementById("dispatch-reminder-btn");

  [ownerEmailInput, caEmailInput, obligationInput, dueDateInput, triggerSelect].forEach((input) => {
    input?.addEventListener("input", syncReminderFormToState);
    input?.addEventListener("change", syncReminderFormToState);
  });

  dispatchButton?.addEventListener("click", dispatchReminderNow);
  loadReminderStatus();
}

function syncReminderFormToState() {
  const ownerEmailField = document.getElementById("rem-owner-email");
  const caEmailField = document.getElementById("rem-ca-email");
  const obligationField = document.getElementById("rem-obligation-name");
  const dueDateField = document.getElementById("rem-due-date");
  const triggerField = document.getElementById("rem-trigger-select");

  state.reminders.ownerEmail = ownerEmailField ? ownerEmailField.value.trim() : state.reminders.ownerEmail;
  state.reminders.caEmail = caEmailField ? caEmailField.value.trim() : state.reminders.caEmail;
  state.reminders.obligationName = obligationField ? obligationField.value.trim() : state.reminders.obligationName;
  state.reminders.dueDate = dueDateField ? dueDateField.value : state.reminders.dueDate;
  state.reminders.trigger = triggerField ? triggerField.value : state.reminders.trigger;
  state.reminders.ownerName = state.auth.fullName || state.reminders.ownerName || "";
  state.reminders.companyName = state.auth.companyName || state.reminders.companyName || "";
  persistReminderProfile();
}

async function loadReminderStatus() {
  const pill = document.getElementById("reminder-status-pill");
  if (!pill) return;

  try {
    const response = await fetch("/api/reminders/status");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Failed with ${response.status}`);

    if (data.resendConfigured) {
      pill.textContent = "Resend configured";
      pill.classList.add("ok");
      pill.classList.remove("warn");
      return;
    }

    if (data.dryRunEnabled) {
      pill.textContent = "Dry run mode";
      pill.classList.add("warn");
      pill.classList.remove("ok");
      return;
    }

    pill.textContent = "Resend missing key";
    pill.classList.add("warn");
    pill.classList.remove("ok");
  } catch {
    pill.textContent = "Status unavailable";
    pill.classList.add("warn");
    pill.classList.remove("ok");
  }
}

async function dispatchReminderNow() {
  syncReminderFormToState();
  const resultBox = document.getElementById("reminder-dispatch-result");
  if (!resultBox) return;

  if (!state.reminders.obligationName || !state.reminders.dueDate) {
    resultBox.style.display = "block";
    resultBox.classList.add("error");
    resultBox.innerHTML = "Obligation and due date are required.";
    return;
  }

  resultBox.style.display = "block";
  resultBox.classList.remove("error");
  resultBox.innerHTML = "Dispatching reminder...";

  try {
    const response = await postJson("/api/reminders/dispatch", buildReminderPayload());
    const emailCount = Array.isArray(response.emailResults) ? response.emailResults.length : 0;
    const channels = Array.isArray(response.channels) ? response.channels.join(" + ") : "channels unavailable";
    resultBox.classList.remove("error");
    resultBox.innerHTML = `Sent trigger <strong>${response.triggerLabel || state.reminders.trigger}</strong> via ${channels}. Email deliveries: <strong>${emailCount}</strong>.`;
  } catch (error) {
    resultBox.classList.add("error");
    resultBox.innerHTML = error.message || "Could not dispatch reminder.";
  }
}

function buildReminderPayload(overrides = {}) {
  return {
    trigger: state.reminders.trigger,
    obligationName: state.reminders.obligationName,
    dueDate: state.reminders.dueDate,
    companyName: state.reminders.companyName || state.auth.companyName || "CompliSure Account",
    ownerName: state.reminders.ownerName || state.auth.fullName || "Owner",
    ownerEmail: state.reminders.ownerEmail,
    caName: state.reminders.caName || "Linked CA",
    caEmail: state.reminders.caEmail,
    ...overrides
  };
}

function generateCalendar() {
  const type = document.getElementById("co-type")?.value || "";
  const sector = document.getElementById("co-sector")?.value || "";
  const stateCode = document.getElementById("co-state")?.value || "";
  const employeeBand = document.querySelector("#emp-group .radio-btn.sel")?.dataset.val || "";
  const gst = document.querySelector("#gst-group .radio-btn.sel")?.dataset.val || "none";
  const deposits = document.querySelector("#dep-group .radio-btn.sel")?.dataset.val || "no";

  if (!type || !stateCode || !employeeBand) {
    window.alert("Please complete all fields before generating.");
    return;
  }

  const profile = {
    type,
    sector,
    stateCode,
    employeeBand,
    gst,
    deposits
  };

  let items = [...COMPLIANCE_DB.base];
  if (gst === "regular") items = [...items, ...COMPLIANCE_DB.gst_regular];
  if (gst === "composition") items = [...items, ...COMPLIANCE_DB.gst_composition];
  if (["1-9", "10-19", "20-99", "100+"].includes(employeeBand)) items = [...items, ...COMPLIANCE_DB.emp_1_9];
  if (["10-19", "20-99", "100+"].includes(employeeBand)) items = [...items, ...COMPLIANCE_DB.emp_10plus];
  if (["20-99", "100+"].includes(employeeBand)) items = [...items, ...COMPLIANCE_DB.emp_20plus];
  if (deposits === "yes") items = [...items, ...COMPLIANCE_DB.deposits];
  const stateKey = `state_${stateCode}`;
  if (COMPLIANCE_DB[stateKey]) items = [...items, ...COMPLIANCE_DB[stateKey]];
  const stagedItems = buildStageTimelineCalendar(items, profile);

  const itemsContainer = document.getElementById("cal-items");
  const output = document.getElementById("cal-output");
  const heading = document.getElementById("cal-heading");
  const summary = document.getElementById("cal-summary");

  if (!itemsContainer || !output || !heading || !summary) return;

  itemsContainer.innerHTML = stagedItems.map((item) => `
    <div class="cal-row">
      <div class="dot dot-${item.urgency}"></div>
      <div class="cal-info">
        <div class="cal-name">${item.stageTag} · ${item.name}${item.dir ? ' <span class="dir-tag">DIR LIABILITY</span>' : ""}</div>
        <div class="cal-dept">${item.dept}</div>
      </div>
      <div class="cal-due">${item.timelineLabel}</div>
      <div class="cal-pen pen-${item.urgency === "g" ? "a" : item.urgency}">${item.pen}</div>
    </div>
  `).join("");
  const stageCounts = stagedItems.reduce((acc, item) => {
    acc[item.stageNumber] += 1;
    return acc;
  }, { 1: 0, 2: 0, 3: 0 });
  heading.textContent = `Your compliance calendar · ${stagedItems.length} items personalised`;
  summary.textContent = `✓ ${stagedItems.length} obligations identified for your profile (${type.toUpperCase()} · ${stateCode} · ${employeeBand} employees · GST: ${gst}). Stages: S1 Foundation ${stageCounts[1]}, S2 Operating ${stageCounts[2]}, S3 Strategic ${stageCounts[3]}.`;
  output.style.display = "block";
  output.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function buildStageTimelineCalendar(items, profile) {
  const today = todayUtcDate();
  return items
    .map((item) => {
      const stage = predictComplianceStage(item, profile);
      const timeline = resolveTimeline(item.due, today);
      return {
        ...item,
        stageNumber: stage.number,
        stageTag: stage.label,
        stageRank: stage.number,
        timelineDate: timeline.isoDate,
        timelineRank: timeline.sortRank,
        timelineLabel: timeline.label
      };
    })
    .sort((left, right) => {
      if (left.stageRank !== right.stageRank) {
        return left.stageRank - right.stageRank;
      }
      if (left.timelineRank !== right.timelineRank) {
        return left.timelineRank - right.timelineRank;
      }
      return left.name.localeCompare(right.name);
    });
}

function predictComplianceStage(item, profile) {
  const due = String(item.due || "").toLowerCase();
  const name = String(item.name || "").toLowerCase();
  const dept = String(item.dept || "").toLowerCase();

  // Lightweight weighted model for staged rollout of obligations.
  let stageScore = 0;
  if (item.urgency === "r") stageScore += 1.6;
  if (item.urgency === "a") stageScore += 1.2;
  if (item.dir) stageScore += 1.1;
  if (due.includes("every month") || due.includes("monthly")) stageScore += 1.2;
  if (due.includes("within")) stageScore -= 0.6;
  if (dept.includes("gst") && profile.gst !== "none") stageScore += 1.3;
  if ((name.includes("pf") || name.includes("esi")) && ["10-19", "20-99", "100+"].includes(profile.employeeBand)) stageScore += 1.2;
  if (profile.deposits === "yes" && name.includes("dpt-3")) stageScore += 1.5;
  if (profile.sector === "nbfc" && dept.includes("income tax")) stageScore += 0.6;

  if (stageScore >= 4.1) {
    return { number: 1, label: "Stage 1: Foundation (0-30d)" };
  }
  if (stageScore >= 2.3) {
    return { number: 2, label: "Stage 2: Operating (30-90d)" };
  }
  return { number: 3, label: "Stage 3: Strategic (90d+)" };
}

function resolveTimeline(rawDue, today) {
  const dueText = String(rawDue || "").trim();
  const lowered = dueText.toLowerCase();
  if (!dueText) {
    return { label: "Timeline unavailable", isoDate: "", sortRank: Number.MAX_SAFE_INTEGER - 1 };
  }

  if (lowered.includes("every month") || lowered.includes("monthly")) {
    const day = pickDayFromDueText(dueText) || 20;
    const nextDate = nextMonthlyDate(today, day);
    return {
      label: `${dueText} · next: ${formatHumanDate(nextDate)} (${daysFromToday(today, nextDate)}d)`,
      isoDate: nextDate,
      sortRank: dateToRank(nextDate)
    };
  }

  if (lowered.includes("within")) {
    const offsetDays = extractFirstNumber(dueText) || 30;
    const target = addDays(today, offsetDays);
    return {
      label: `${dueText} · target: ${formatHumanDate(target)} (${offsetDays}d)`,
      isoDate: target,
      sortRank: dateToRank(target)
    };
  }

  const yearMatch = dueText.match(/(20\d{2})/);
  const inferredYear = yearMatch ? Number.parseInt(yearMatch[1], 10) : today.getUTCFullYear();
  const month = extractMonthIndex(dueText);
  const day = pickDayFromDueText(dueText) || 15;

  if (month >= 0) {
    let candidate = isoDate(inferredYear, month, day);
    if (candidate < formatIsoDate(today)) {
      candidate = isoDate(inferredYear + 1, month, day);
    }
    return {
      label: `${dueText} · est: ${formatHumanDate(candidate)} (${daysFromToday(today, candidate)}d)`,
      isoDate: candidate,
      sortRank: dateToRank(candidate)
    };
  }

  return { label: `${dueText} · timeline TBD`, isoDate: "", sortRank: Number.MAX_SAFE_INTEGER };
}

function pickDayFromDueText(value) {
  const normalized = String(value || "");
  const match = normalized.match(/\b(\d{1,2})(st|nd|rd|th)?\b/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  if (parsed < 1 || parsed > 31) return null;
  return parsed;
}

function extractMonthIndex(value) {
  const months = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };
  const lowered = String(value || "").toLowerCase();
  for (const [name, index] of Object.entries(months)) {
    if (lowered.includes(name)) return index;
  }
  return -1;
}

function extractFirstNumber(value) {
  const match = String(value || "").match(/\b(\d+)\b/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function nextMonthlyDate(today, day) {
  const safeDay = Math.min(Math.max(day, 1), 28);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const todayIso = formatIsoDate(today);
  let nextDate = isoDate(year, month, safeDay);
  if (nextDate < todayIso) {
    nextDate = month === 11 ? isoDate(year + 1, 0, safeDay) : isoDate(year, month + 1, safeDay);
  }
  return nextDate;
}

function isoDate(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(date, offsetDays) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + offsetDays);
  return formatIsoDate(next);
}

function daysFromToday(today, iso) {
  const target = parseIsoDate(iso);
  if (!target) return "n/a";
  return daysBetweenUtc(today, target);
}

function dateToRank(iso) {
  const date = parseIsoDate(iso);
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
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

function syncNoticeFormToState() {
  const noticeTextField = document.getElementById("notice-text");
  const noticeChatField = document.getElementById("notice-chat-input");

  state.noticeWorkspace.sourceText = noticeTextField ? noticeTextField.value : state.noticeWorkspace.sourceText;
  state.noticeWorkspace.questionInput = noticeChatField ? noticeChatField.value : state.noticeWorkspace.questionInput;
}

function handleNoticeFileSelection(event) {
  const file = event.target.files?.[0];
  state.activeToolTab = "notice";
  state.noticeWorkspace.selectedFileName = file ? file.name : "";
  state.noticeWorkspace.sourceLabel = file ? file.name : state.noticeWorkspace.sourceLabel;
  state.noticeWorkspace.noticeMessage = file ? `Ready to analyze ${file.name}.` : "";
  state.noticeWorkspace.noticeError = false;
  document.querySelector("#tab-notice .bill-dropzone-sub")?.replaceChildren(state.noticeWorkspace.selectedFileName || state.noticeWorkspace.sourceLabel || "No file selected yet");
}

async function interpretNotice() {
  syncNoticeFormToState();
  const input = document.getElementById("notice-upload-input");
  const file = input?.files?.[0];
  const text = (state.noticeWorkspace.sourceText || "").trim();
  state.activeToolTab = "notice";

  if (!text && !file) {
    state.noticeWorkspace.noticeMessage = "Paste notice text or upload a PDF/image notice before interpreting.";
    state.noticeWorkspace.noticeError = true;
    renderApp();
    return;
  }

  if (file && file.size > 10 * 1024 * 1024) {
    state.noticeWorkspace.noticeMessage = "Use a notice file smaller than 10 MB for reliable interpretation.";
    state.noticeWorkspace.noticeError = true;
    renderApp();
    return;
  }

  state.noticeWorkspace.loading = true;
  state.noticeWorkspace.noticeError = false;
  state.noticeWorkspace.noticeMessage = file
    ? `Analyzing ${file.name} with Groq...`
    : "Analyzing pasted notice text with Groq...";
  renderApp();

  try {
    const payload = {
      text,
      companyName: state.auth.companyName,
      founderName: state.auth.fullName
    };

    if (file) {
      const upload = await readFileAsUpload(file);
      payload.fileName = upload.fileName;
      payload.mimeType = upload.mimeType;
      payload.fileBase64 = upload.fileBase64;
      state.noticeWorkspace.sourceLabel = file.name;
      state.noticeWorkspace.selectedFileName = file.name;
    } else {
      state.noticeWorkspace.selectedFileName = "";
      state.noticeWorkspace.sourceLabel = text ? "Pasted notice text" : state.noticeWorkspace.sourceLabel;
    }

    const response = await postJson("/api/notices/interpret", payload);
    state.noticeWorkspace.loading = false;
    state.noticeWorkspace.interpretation = response.interpretation || null;
    state.noticeWorkspace.chatHistory = [];
    state.noticeWorkspace.noticeError = false;
    state.noticeWorkspace.noticeMessage = response.message || "Notice interpreted successfully.";
    state.noticeWorkspace.questionInput = "";
    persistNoticeWorkspace();
    if (input && file) {
      input.value = "";
    }
    renderApp();
  } catch (error) {
    state.noticeWorkspace.loading = false;
    state.noticeWorkspace.noticeError = true;
    state.noticeWorkspace.noticeMessage = error.message || "Could not interpret the notice.";
    renderApp();
  }
}

async function handleNoticeChat() {
  syncNoticeFormToState();
  const question = (state.noticeWorkspace.questionInput || "").trim();
  const interpretation = state.noticeWorkspace.interpretation;
  state.activeToolTab = "notice";

  if (!interpretation) {
    state.noticeWorkspace.noticeError = true;
    state.noticeWorkspace.noticeMessage = "Interpret a notice first before starting a follow-up chat.";
    renderApp();
    return;
  }

  if (!question) {
    state.noticeWorkspace.noticeError = true;
    state.noticeWorkspace.noticeMessage = "Enter a follow-up question about the notice.";
    renderApp();
    return;
  }

  state.noticeWorkspace.chatLoading = true;
  state.noticeWorkspace.noticeError = false;
  state.noticeWorkspace.noticeMessage = "Asking Groq your follow-up question...";
  renderApp();

  try {
    const response = await postJson("/api/notices/chat", {
      question,
      interpretation,
      history: state.noticeWorkspace.chatHistory,
      sourceText: state.noticeWorkspace.sourceText,
      companyName: state.auth.companyName,
      founderName: state.auth.fullName
    });

    state.noticeWorkspace.chatHistory = [
      ...state.noticeWorkspace.chatHistory,
      { role: "user", content: question },
      {
        role: "assistant",
        content: response.answer || "No answer returned.",
        businessImpact: response.businessImpact || "",
        nextSteps: Array.isArray(response.nextSteps) ? response.nextSteps : [],
        caution: response.caution || ""
      }
    ];
    state.noticeWorkspace.chatLoading = false;
    state.noticeWorkspace.questionInput = "";
    state.noticeWorkspace.noticeError = false;
    state.noticeWorkspace.noticeMessage = "Follow-up answered. Keep asking if you want to drill deeper.";
    persistNoticeWorkspace();
    renderApp();
  } catch (error) {
    state.noticeWorkspace.chatLoading = false;
    state.noticeWorkspace.noticeError = true;
    state.noticeWorkspace.noticeMessage = error.message || "Could not answer the follow-up question.";
    renderApp();
  }
}

async function handleWhatsappAction(action) {
  const response = document.getElementById("wa-response");
  if (!response) return;

  response.style.display = "block";
  response.innerHTML = `<div class="wa-bubble sent">${action}<div class="wa-time">Just now</div></div><div class="wa-bubble" style="margin-top:6px">Processing action...</div>`;

  try {
    syncReminderFormToState();
    const payload = buildReminderPayload({ action });
    const apiResponse = await postJson("/api/reminders/action", payload);
    const message = apiResponse.message || "Action completed.";

    if (action === "penalty") {
      const penaltyUrl = apiResponse.penaltyUrl || "#tab-penalty";
      response.innerHTML = `<div class="wa-bubble sent">See penalty<div class="wa-time">Just now</div></div><div class="wa-bubble" style="margin-top:6px">${message}<br /><a href="${penaltyUrl}" style="color:#86efac" target="_blank" rel="noreferrer">Open calculator</a><div class="wa-time">Just now</div></div>`;
      return;
    }

    response.innerHTML = `<div class="wa-bubble sent">${action === "filed" ? "Mark as filed" : "Remind CA"}<div class="wa-time">Just now</div></div><div class="wa-bubble" style="margin-top:6px">${message}<div class="wa-time">Just now</div></div>`;
  } catch (error) {
    response.innerHTML = `<div class="wa-bubble sent">${action}<div class="wa-time">Just now</div></div><div class="wa-bubble" style="margin-top:6px;color:#fca5a5">${error.message || "Could not complete action."}<div class="wa-time">Just now</div></div>`;
  }
}

function syncCaFormToState() {
  const clientField = document.getElementById("ca-client-input");
  const filingField = document.getElementById("ca-filing-input");
  const deptField = document.getElementById("ca-dept-input");
  const dueDateField = document.getElementById("ca-due-date-input");

  state.caPortal.form.client = clientField ? clientField.value.trim() : state.caPortal.form.client;
  state.caPortal.form.filing = filingField ? filingField.value.trim() : state.caPortal.form.filing;
  state.caPortal.form.dept = deptField ? deptField.value.trim() : state.caPortal.form.dept;
  state.caPortal.form.dueDate = dueDateField ? dueDateField.value : state.caPortal.form.dueDate;
}

async function hydrateCaRowsFromServer(force = false) {
  if ((state.caPortal.hydrated && !force) || state.caPortal.hydrating) {
    return;
  }

  state.caPortal.hydrating = true;
  state.caPortal.error = false;
  state.caPortal.message = force ? "Refreshing CA portal from Qdrant Cloud..." : "Loading CA portal from Qdrant Cloud...";
  renderApp();

  try {
    const params = new URLSearchParams(buildCaWorkspaceQuery());
    const response = await fetchJson(`/api/ca/rows?${params.toString()}`);
    state.caRows = Array.isArray(response.rows) ? response.rows : [];
    state.caPortal.hydrating = false;
    state.caPortal.hydrated = true;
    state.caPortal.error = false;
    state.caPortal.message = response.message || "CA portal synced with Qdrant Cloud.";
    renderApp();
  } catch (error) {
    state.caPortal.hydrating = false;
    state.caPortal.hydrated = true;
    state.caPortal.error = true;
    state.caPortal.message = error.message || "Could not load the CA portal from Qdrant Cloud.";
    renderApp();
  }
}

async function handleAddCaRow() {
  syncCaFormToState();
  const form = state.caPortal.form;
  state.activeToolTab = "ca";

  if (!form.client || !form.filing || !form.dept || !form.dueDate) {
    state.caPortal.error = true;
    state.caPortal.message = "Client, filing, department, and due date are required.";
    renderApp();
    return;
  }

  state.caPortal.saving = true;
  state.caPortal.error = false;
  state.caPortal.message = `Saving ${form.filing} for ${form.client}...`;
  renderApp();

  try {
    const response = await postJson("/api/ca/rows/upsert", {
      ...buildCaWorkspaceQuery(),
      ownerEmail: state.reminders.ownerEmail,
      caName: state.reminders.caName || "Linked CA",
      caEmail: state.reminders.caEmail,
      row: {
        client: form.client,
        filing: form.filing,
        dept: form.dept,
        dueDate: form.dueDate,
        status: "pending"
      }
    });

    state.caRows = Array.isArray(response.rows) ? response.rows : state.caRows;
    state.caPortal.form = createDefaultCaPortalState().form;
    state.caPortal.saving = false;
    state.caPortal.error = false;
    if (response.reminder?.sent) {
      state.caPortal.message = `${response.message || "CA filing added."} Channels: ${(response.reminder.channels || []).join(" + ")}.`;
    } else if (response.reminder?.skipped) {
      state.caPortal.message = `${response.message || "CA filing added."} Reminder skipped: ${response.reminder.reason || "Configure recipient emails."}`;
    } else {
      state.caPortal.message = response.message || "CA filing added.";
    }
    renderApp();
  } catch (error) {
    state.caPortal.saving = false;
    state.caPortal.error = true;
    state.caPortal.message = error.message || "Could not add the CA filing.";
    renderApp();
  }
}

async function handleCaStatusChange(select) {
  const rowIndex = Number(select.dataset.rowIndex);
  const row = state.caRows[rowIndex];
  if (!row) return;

  const previousStatus = row.status;
  const nextStatus = select.value;
  row.status = nextStatus;
  applyStatusStyle(select, nextStatus);
  updatePendingCount();

  state.caPortal.saving = true;
  state.caPortal.error = false;
  state.caPortal.message = `Updating ${row.filing} for ${row.client}...`;

  try {
    const response = await postJson("/api/ca/rows/upsert", {
      ...buildCaWorkspaceQuery(),
      row: {
        ...row,
        status: nextStatus
      }
    });

    state.caRows = Array.isArray(response.rows) ? response.rows : state.caRows;
    state.caPortal.saving = false;
    state.caPortal.error = false;
    state.caPortal.message = response.message || "CA filing updated.";
    renderApp();
  } catch (error) {
    row.status = previousStatus;
    state.caPortal.saving = false;
    state.caPortal.error = true;
    state.caPortal.message = error.message || "Could not update the CA filing.";
    renderApp();
  }
}

async function handleMarkAllFiled() {
  if (!state.caRows.length) return;

  state.activeToolTab = "ca";
  state.caPortal.saving = true;
  state.caPortal.error = false;
  state.caPortal.message = "Marking all CA portal filings as filed...";
  renderApp();

  try {
    const response = await postJson("/api/ca/rows/mark-all-filed", {
      ...buildCaWorkspaceQuery(),
      rows: state.caRows
    });

    state.caRows = Array.isArray(response.rows) ? response.rows : state.caRows;
    state.caPortal.saving = false;
    state.caPortal.error = false;
    state.caPortal.message = response.message || "All CA portal filings marked as filed.";
    renderApp();
  } catch (error) {
    state.caPortal.saving = false;
    state.caPortal.error = true;
    state.caPortal.message = error.message || "Could not mark all CA portal filings as filed.";
    renderApp();
  }
}

function buildCaWorkspaceQuery() {
  return {
    companyName: state.auth.companyName || "CompliSure Account",
    fullName: state.auth.fullName || "Founder"
  };
}

function applyActiveToolTab() {
  const activeTab = state.activeToolTab || "onboard";
  document.querySelectorAll(".demo-tab").forEach((item) => {
    item.classList.toggle("active", item.dataset.tab === activeTab);
  });
  document.querySelectorAll(".demo-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${activeTab}`);
  });
}

function handleBillFileSelection(event) {
  const file = event.target.files?.[0];
  state.activeToolTab = "bills";
  state.billWorkspace.selectedFileName = file ? file.name : "";
  state.billWorkspace.scanMessage = file ? `Ready to scan ${file.name}.` : "";
  state.billWorkspace.scanError = false;
  document.querySelector("#tab-bills .bill-dropzone-sub")?.replaceChildren(state.billWorkspace.selectedFileName || "No file selected yet");
}

async function handleBillScan() {
  const input = document.getElementById("bill-upload-input");
  const file = input?.files?.[0];
  state.activeToolTab = "bills";

  if (!file) {
    state.billWorkspace.scanMessage = "Choose a bill, invoice image, or PDF before scanning.";
    state.billWorkspace.scanError = true;
    renderApp();
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    state.billWorkspace.scanMessage = "Use a document smaller than 10 MB for reliable invoice extraction.";
    state.billWorkspace.scanError = true;
    renderApp();
    return;
  }

  state.billWorkspace.scanLoading = true;
  state.billWorkspace.scanError = false;
  state.billWorkspace.scanMessage = `Scanning ${file.name} with Groq...`;
  state.billWorkspace.selectedFileName = file.name;
  renderApp();

  try {
    const upload = await readFileAsUpload(file);
    const response = await postJson("/api/bills/scan", upload);
    state.billWorkspace.documents = Array.isArray(response.workspace?.documents) ? response.workspace.documents : state.billWorkspace.documents;
    state.billWorkspace.transactions = Array.isArray(response.workspace?.transactions) ? response.workspace.transactions : state.billWorkspace.transactions;
    state.billWorkspace.scanLoading = false;
    state.billWorkspace.scanError = false;
    state.billWorkspace.scanMessage = response.message || `${file.name} scanned successfully.`;
    state.billWorkspace.selectedFileName = "";
    state.billWorkspace.hydrated = true;
    state.billWorkspace.hydrating = false;
    persistBillWorkspace();
    if (input) {
      input.value = "";
    }
    renderApp();
  } catch (error) {
    state.billWorkspace.scanLoading = false;
    state.billWorkspace.hydrating = false;
    state.billWorkspace.scanError = true;
    state.billWorkspace.scanMessage = error.message || "Bill scanning failed.";
    renderApp();
  }
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

async function readFileAsUpload(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const [, base64 = ""] = dataUrl.split(",", 2);

  return {
    fileName: file.name,
    mimeType: file.type || inferMimeTypeFromName(file.name),
    fileBase64: base64
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the uploaded bill or invoice file."));
    reader.readAsDataURL(file);
  });
}

function buildStoredBillDocument(document) {
  return {
    id: createId("bill"),
    scannedAt: new Date().toISOString(),
    fileName: document.fileName || "scanned-bill",
    mimeType: document.mimeType || "image/jpeg",
    documentType: document.documentType || "invoice",
    vendorName: document.vendorName || "Unknown vendor",
    invoiceNumber: document.invoiceNumber || "",
    invoiceDate: document.invoiceDate || "",
    dueDate: document.dueDate || "",
    currency: document.currency || "INR",
    subtotal: toNumber(document.subtotal),
    taxAmount: toNumber(document.taxAmount),
    cgstAmount: toNumber(document.cgstAmount),
    sgstAmount: toNumber(document.sgstAmount),
    igstAmount: toNumber(document.igstAmount),
    totalAmount: toNumber(document.totalAmount),
    paymentMethod: document.paymentMethod || "",
    gstin: document.gstin || "",
    category: document.category || "General expense",
    notes: document.notes || "",
    confidence: toNumber(document.confidence),
    lineItems: Array.isArray(document.lineItems) ? document.lineItems.map((item) => ({
      description: item.description || "Scanned item",
      quantity: toNumber(item.quantity) || 1,
      unitPrice: toNumber(item.unitPrice),
      amount: toNumber(item.amount),
      taxRate: toNumber(item.taxRate),
      taxAmount: toNumber(item.taxAmount),
      category: item.category || document.category || "General expense"
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
    description: item.description || `Line item ${index + 1}`,
    category: item.category || document.category || "General expense",
    quantity: toNumber(item.quantity) || 1,
    unitPrice: toNumber(item.unitPrice),
    baseAmount: toNumber(item.amount),
    taxAmount: toNumber(item.taxAmount),
    grossAmount: toNumber(item.amount) + toNumber(item.taxAmount),
    gstin: document.gstin || "",
    paymentMethod: document.paymentMethod || ""
  }));
}

async function hydrateBillWorkspaceFromServer() {
  if (state.billWorkspace.hydrated || state.billWorkspace.hydrating) {
    return;
  }

  state.billWorkspace.hydrating = true;

  try {
    const response = await fetchJson("/api/bills");
    const serverWorkspace = createDefaultBillWorkspace(response.workspace || {});
    const shouldUseServerData = serverWorkspace.documents.length > 0 || serverWorkspace.transactions.length > 0 || state.billWorkspace.documents.length === 0;

    if (shouldUseServerData) {
      state.billWorkspace.documents = serverWorkspace.documents;
      state.billWorkspace.transactions = serverWorkspace.transactions;
      persistBillWorkspace();
    }

    state.billWorkspace.hydrated = true;
    state.billWorkspace.hydrating = false;
    renderApp();
  } catch {
    state.billWorkspace.hydrated = true;
    state.billWorkspace.hydrating = false;
  }
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toNumber(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").replace(/₹/g, "").trim();
    return Number.parseFloat(cleaned) || 0;
  }
  return Number(value) || 0;
}

function inferMimeTypeFromName(fileName) {
  const normalized = String(fileName || "").toLowerCase();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".heic")) return "image/heic";
  if (normalized.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
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

function persistReminderProfile() {
  localStorage.setItem("complisure-reminder-profile", JSON.stringify({
    ownerName: state.reminders.ownerName,
    companyName: state.reminders.companyName,
    ownerEmail: state.reminders.ownerEmail,
    caName: state.reminders.caName,
    caEmail: state.reminders.caEmail,
    obligationName: state.reminders.obligationName,
    dueDate: state.reminders.dueDate,
    trigger: state.reminders.trigger
  }));
}

function readReminderProfile() {
  try {
    const raw = localStorage.getItem("complisure-reminder-profile");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistBillWorkspace() {
  localStorage.setItem("complisure-bill-workspace", JSON.stringify({
    documents: state.billWorkspace.documents,
    transactions: state.billWorkspace.transactions
  }));
}

function readBillWorkspace() {
  try {
    const raw = localStorage.getItem("complisure-bill-workspace");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistNoticeWorkspace() {
  localStorage.setItem("complisure-notice-workspace", JSON.stringify({
    sourceText: state.noticeWorkspace.sourceText,
    sourceLabel: state.noticeWorkspace.sourceLabel,
    interpretation: state.noticeWorkspace.interpretation,
    chatHistory: state.noticeWorkspace.chatHistory
  }));
}

function readNoticeWorkspace() {
  try {
    const raw = localStorage.getItem("complisure-notice-workspace");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function fetchJson(url) {
  const response = await fetch(url);

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

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function parseIsoDate(value) {
  const raw = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function daysBetweenUtc(fromDate, toDate) {
  return Math.round((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
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
