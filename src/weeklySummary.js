/**
 * Weekly task/deadline summary from onboarding calendar + CA portal rows.
 * Week = Monday–Sunday in the user's local timezone (ISO date comparison).
 */

import { classifyCalendarItem } from "./complianceHealth.js";

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** @returns {{ weekStart: string, weekEnd: string, label: string, dayLabels: string[] }} */
export function getCurrentWeekIsoRange(reference = new Date()) {
  const d = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const toIso = (x) => `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;

  const weekStart = toIso(monday);
  const weekEnd = toIso(sunday);

  const fmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
  const label = `${fmt.format(monday)} – ${fmt.format(sunday)}, ${monday.getFullYear()}`;

  const dayLabels = [];
  for (let i = 0; i < 7; i += 1) {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    dayLabels.push({
      iso: toIso(x),
      weekday: new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(x),
      dayNum: x.getDate()
    });
  }

  return { weekStart, weekEnd, label, dayLabels };
}

function normalizeCaDue(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
}

function todayIsoLocal() {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}

/**
 * @param {{ onboardingProfile?: object, calendarItems?: object[], caRows?: object[] }} input
 */
export function computeWeeklySummary(input) {
  const onboardingProfile = input.onboardingProfile && typeof input.onboardingProfile === "object"
    ? input.onboardingProfile
    : {};
  const calendarItems = Array.isArray(input.calendarItems) ? input.calendarItems : [];
  const caRows = Array.isArray(input.caRows) ? input.caRows : [];

  const { weekStart, weekEnd, label, dayLabels } = getCurrentWeekIsoRange();
  const today = todayIsoLocal();

  const typeLabel = (t) => {
    const m = { pvt: "Pvt Ltd", llp: "LLP", opc: "OPC", prop: "Proprietorship" };
    return m[String(t).toLowerCase()] || String(t || "").toUpperCase() || "";
  };

  const profileBits = [
    typeLabel(onboardingProfile.companyType || onboardingProfile.type),
    onboardingProfile.stateCode,
    onboardingProfile.sector
  ].filter(Boolean);
  const gstBit = onboardingProfile.gst ? `GST: ${onboardingProfile.gst}` : "";
  const profileSummary = [profileBits.join(" · "), gstBit].filter(Boolean).join(" · ")
    || "Generate your calendar and sync CA rows to populate this week’s view.";

  const calendarInWeek = [];
  for (const item of calendarItems) {
    const iso = item.timelineDate && /^\d{4}-\d{2}-\d{2}$/.test(String(item.timelineDate))
      ? String(item.timelineDate)
      : null;
    if (!iso || iso < weekStart || iso > weekEnd) continue;
    const cls = classifyCalendarItem(item);
    calendarInWeek.push({
      kind: "calendar",
      id: `${iso}-${item.name}-${item.dept}`,
      name: String(item.name || "Obligation"),
      dept: String(item.dept || ""),
      stageTag: String(item.stageTag || ""),
      iso,
      urgency: String(item.urgency || ""),
      status: cls.status,
      daysOffset: cls.days
    });
  }
  calendarInWeek.sort((a, b) => a.iso.localeCompare(b.iso) || a.name.localeCompare(b.name));

  const caInWeek = [];
  for (const row of caRows) {
    const iso = normalizeCaDue(row.dueDate || row.due);
    if (!iso || iso < weekStart || iso > weekEnd) continue;
    const st = String(row.status || "pending").toLowerCase();
    caInWeek.push({
      kind: "ca",
      id: `${iso}-${String(row.client || "")}-${String(row.filing || "")}`,
      client: String(row.client || ""),
      filing: String(row.filing || ""),
      dept: String(row.dept || ""),
      iso,
      status: st
    });
  }
  caInWeek.sort((a, b) => a.iso.localeCompare(b.iso) || a.client.localeCompare(b.client));

  const overdueCalendar = [];
  for (const item of calendarItems) {
    const iso = item.timelineDate && /^\d{4}-\d{2}-\d{2}$/.test(String(item.timelineDate))
      ? String(item.timelineDate)
      : null;
    if (!iso || iso >= today) continue;
    const cls = classifyCalendarItem(item);
    if (cls.status === "overdue") {
      overdueCalendar.push({
        name: String(item.name || "Obligation"),
        dept: String(item.dept || ""),
        iso,
        daysLate: cls.days != null ? -cls.days : 0
      });
    }
  }
  overdueCalendar.sort((a, b) => b.daysLate - a.daysLate);

  const overdueCa = caRows.filter((row) => {
    const iso = normalizeCaDue(row.dueDate || row.due);
    const st = String(row.status || "").toLowerCase();
    if (st === "overdue") return true;
    if (iso && iso < today && st !== "filed") return true;
    return false;
  }).map((row) => ({
    client: String(row.client || ""),
    filing: String(row.filing || ""),
    dept: String(row.dept || ""),
    iso: normalizeCaDue(row.dueDate || row.due),
    status: String(row.status || "")
  }));

  const byDay = new Map();
  for (const d of dayLabels) {
    byDay.set(d.iso, { iso: d.iso, weekday: d.weekday, dayNum: d.dayNum, items: [] });
  }
  for (const c of calendarInWeek) {
    const bucket = byDay.get(c.iso);
    if (bucket) bucket.items.push(c);
  }
  for (const c of caInWeek) {
    const bucket = byDay.get(c.iso);
    if (bucket) bucket.items.push(c);
  }

  const totalInWeek = calendarInWeek.length + caInWeek.length;
  const hasData = calendarItems.length > 0 || caRows.length > 0;

  return {
    weekStart,
    weekEnd,
    weekLabel: label,
    dayLabels,
    profileSummary,
    calendarInWeek,
    caInWeek,
    byDay: Array.from(byDay.values()),
    overdueCalendar: overdueCalendar.slice(0, 8),
    overdueCa: overdueCa.slice(0, 8),
    totalInWeek,
    hasData,
    today
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderWeeklySummaryWidgetHtml(summary) {
  const s = summary || computeWeeklySummary({});
  const overdueBlock =
    (s.overdueCalendar.length || s.overdueCa.length)
      ? `
    <div class="ws-attention" role="status">
      <div class="ws-attention-title">Outside this week — still urgent</div>
      <ul class="ws-attention-list">
        ${s.overdueCalendar.slice(0, 4).map((o) => `
          <li><span class="ws-attention-pill ws-attention-pill--cal">Calendar</span> ${escapeHtml(o.name)} <span class="ws-muted">(${escapeHtml(o.dept)}) · ${escapeHtml(o.iso)}</span></li>`).join("")}
        ${s.overdueCa.slice(0, 4).map((o) => `
          <li><span class="ws-attention-pill ws-attention-pill--ca">CA</span> ${escapeHtml(o.client)} — ${escapeHtml(o.filing)} <span class="ws-muted">· ${escapeHtml(o.iso || "")}</span></li>`).join("")}
      </ul>
    </div>`
      : "";

  if (!s.hasData) {
    return `
      <div class="ws-card ws-card--empty" id="weekly-summary">
        <div class="ws-head">
          <div>
            <div class="ws-eyebrow">This week</div>
            <h2 class="ws-title">Weekly compliance snapshot</h2>
            <p class="ws-sub">${escapeHtml(s.weekLabel)}</p>
          </div>
        </div>
        <p class="ws-empty">No calendar or CA data yet. Use <strong>Live tools</strong> to generate your calendar and refresh the CA portal — your week view will fill in automatically.</p>
      </div>`;
  }

  const dayColumns = s.byDay
    .map((day) => {
      const rows = day.items
        .map((it) => {
          if (it.kind === "calendar") {
            const risk =
              it.status === "overdue"
                ? "ws-task--risk"
                : it.status === "soon"
                  ? "ws-task--soon"
                  : "ws-task--ok";
            return `
            <div class="ws-task ${risk}">
              <span class="ws-task-pill ws-task-pill--cal">Cal</span>
              <div class="ws-task-body">
                <div class="ws-task-name">${escapeHtml(it.name)}</div>
                <div class="ws-task-meta">${escapeHtml(it.dept)}${it.stageTag ? ` · ${escapeHtml(it.stageTag)}` : ""}</div>
              </div>
            </div>`;
          }
          const st = it.status === "filed" ? "ws-task--ok" : it.status === "overdue" ? "ws-task--risk" : "ws-task--soon";
          return `
            <div class="ws-task ${st}">
              <span class="ws-task-pill ws-task-pill--ca">CA</span>
              <div class="ws-task-body">
                <div class="ws-task-name">${escapeHtml(it.filing)}</div>
                <div class="ws-task-meta">${escapeHtml(it.client)} · ${escapeHtml(it.dept)}</div>
              </div>
            </div>`;
        })
        .join("");

      const isToday = day.iso === s.today;
      return `
        <div class="ws-day ${isToday ? "ws-day--today" : ""}">
          <div class="ws-day-head">
            <span class="ws-day-wd">${escapeHtml(day.weekday)}</span>
            <span class="ws-day-num">${day.dayNum}</span>
          </div>
          <div class="ws-day-body">
            ${rows || `<div class="ws-day-empty">—</div>`}
          </div>
        </div>`;
    })
    .join("");

  return `
    <div class="ws-card" id="weekly-summary">
      <div class="ws-head">
        <div>
          <div class="ws-eyebrow">This week</div>
          <h2 class="ws-title">Compliance &amp; filings</h2>
          <p class="ws-sub">${escapeHtml(s.weekLabel)} · <span class="ws-profile">${escapeHtml(s.profileSummary)}</span></p>
        </div>
        <div class="ws-stat-pill" title="Tasks with a date falling this week">
          <span class="ws-stat-val">${s.totalInWeek}</span>
          <span class="ws-stat-lab">this week</span>
        </div>
      </div>
      <div class="ws-week-grid" role="list">${dayColumns}</div>
      ${overdueBlock}
    </div>`;
}
