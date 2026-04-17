/**
 * Compliance health score, bucket counts, and alert copy from calendar items.
 * Uses timelineDate (ISO) when present; otherwise treats as unscheduled.
 */

export const COMPLIANCE_SOON_DAYS = 14;
const SOON_DAYS_DEFAULT = COMPLIANCE_SOON_DAYS;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function todayUtcDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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

function daysFromTodayUtc(today, iso) {
  const target = parseIsoDate(iso);
  if (!target) return null;
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function bandFromScore(score) {
  if (score >= 85) {
    return { id: "healthy", label: "Healthy", hint: "Most obligations are on track." };
  }
  if (score >= 65) {
    return { id: "fair", label: "Fair", hint: "Some items need attention soon." };
  }
  if (score >= 40) {
    return { id: "attention", label: "At risk", hint: "Overdue or tight deadlines detected." };
  }
  return { id: "critical", label: "Critical", hint: "Immediate action required on overdue items." };
}

export function classifyCalendarItem(item, options = {}) {
  const soonDays = Number(options.soonDays) > 0 ? Number(options.soonDays) : SOON_DAYS_DEFAULT;
  const today = todayUtcDate();
  const iso = item.timelineDate && /^\d{4}-\d{2}-\d{2}$/.test(String(item.timelineDate))
    ? String(item.timelineDate)
    : null;
  if (!iso) {
    return { status: "unknown", days: null };
  }
  const d = daysFromTodayUtc(today, iso);
  if (d === null) {
    return { status: "unknown", days: null };
  }
  if (d < 0) {
    return { status: "overdue", days: d };
  }
  if (d <= soonDays) {
    return { status: "soon", days: d };
  }
  return { status: "ok", days: d };
}

export function computeComplianceHealth(items, options = {}) {
  const soonDays = Number(options.soonDays) > 0 ? Number(options.soonDays) : SOON_DAYS_DEFAULT;
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    return {
      empty: true,
      score: null,
      band: null,
      overdue: [],
      dueSoon: [],
      onTrack: 0,
      noDate: 0,
      alerts: [],
      soonDays
    };
  }

  const today = todayUtcDate();
  const overdue = [];
  const dueSoon = [];
  let onTrack = 0;
  let noDate = 0;

  for (const item of list) {
    const iso = item.timelineDate && /^\d{4}-\d{2}-\d{2}$/.test(String(item.timelineDate))
      ? String(item.timelineDate)
      : null;
    if (!iso) {
      noDate += 1;
      continue;
    }
    const d = daysFromTodayUtc(today, iso);
    if (d === null) {
      noDate += 1;
      continue;
    }
    const name = String(item.name || "Obligation");
    if (d < 0) {
      overdue.push({ name, daysLate: -d, iso });
    } else if (d <= soonDays) {
      dueSoon.push({ name, daysUntil: d, iso });
    } else {
      onTrack += 1;
    }
  }

  overdue.sort((a, b) => b.daysLate - a.daysLate);
  dueSoon.sort((a, b) => a.daysUntil - b.daysUntil);

  let score = 100;
  score -= Math.min(overdue.length * 15, 45);
  score -= Math.min(dueSoon.length * 5, 25);
  score -= Math.min(noDate * 3, 18);
  score = Math.max(0, Math.min(100, Math.round(score)));

  const band = bandFromScore(score);
  const alerts = buildAlerts({ overdue, dueSoon, noDate, onTrack, soonDays });

  return {
    empty: false,
    score,
    band,
    overdue,
    dueSoon,
    onTrack,
    noDate,
    alerts,
    soonDays,
    total: list.length
  };
}

function buildAlerts({ overdue, dueSoon, noDate, onTrack, soonDays }) {
  const alerts = [];
  if (overdue.length > 0) {
    const names = overdue.slice(0, 3).map((o) => o.name).join(", ");
    const extra = overdue.length > 3 ? ` (+${overdue.length - 3} more)` : "";
    alerts.push({
      level: "critical",
      title: "Overdue obligations",
      body: `${overdue.length} item${overdue.length === 1 ? "" : "s"} past deadline${extra ? `: ${names}${extra}` : "."}`
    });
  }
  if (dueSoon.length > 0) {
    alerts.push({
      level: dueSoon.length >= 4 ? "risk" : "warn",
      title: `Due within ${soonDays} days`,
      body: `${dueSoon.length} pending task${dueSoon.length === 1 ? "" : "s"} approaching — plan filings to avoid penalties.`
    });
  }
  if (noDate > 0) {
    alerts.push({
      level: "info",
      title: "Unscheduled items",
      body: `${noDate} obligation${noDate === 1 ? "" : "s"} have no computed deadline — confirm dates with your CA.`
    });
  }
  if (overdue.length === 0 && dueSoon.length === 0 && noDate === 0 && onTrack > 0) {
    alerts.push({
      level: "ok",
      title: "All tracked items on schedule",
      body: "Every obligation with a fixed date is beyond the near-term window."
    });
  }
  return alerts;
}

export function renderComplianceHealthDashboardHtml(health) {
  if (health.empty) {
    return `
      <div class="ch-card ch-card--empty" id="compliance-health-card">
        <div class="ch-card-head">
          <div>
            <div class="ch-eyebrow">Compliance health</div>
            <div class="ch-title">No calendar data yet</div>
          </div>
        </div>
        <p class="ch-empty-copy">Generate your personalised compliance calendar in <strong>Live tools</strong> to see a health score, risk alerts, and deadline breakdown.</p>
      </div>`;
  }

  const { score, band, overdue, dueSoon, onTrack, noDate, alerts, soonDays, total } = health;
  const barPct = score;
  const bandClass = `ch-band--${band.id}`;

  const stat = (val, label, mod) => `
    <div class="ch-stat ch-stat--${escapeHtml(mod)}">
      <span class="ch-stat-val">${escapeHtml(String(val))}</span>
      <span class="ch-stat-lab">${escapeHtml(label)}</span>
    </div>`;

  const alertRows = alerts.map((a) => {
    const lv = escapeHtml(a.level);
    return `
      <div class="ch-alert ch-alert--${lv}" role="status">
        <span class="ch-alert-dot" aria-hidden="true"></span>
        <div>
          <div class="ch-alert-title">${escapeHtml(a.title)}</div>
          <div class="ch-alert-body">${escapeHtml(a.body)}</div>
        </div>
      </div>`;
  }).join("");

  return `
    <div class="ch-card" id="compliance-health-card">
      <div class="ch-card-head">
        <div>
          <div class="ch-eyebrow">Compliance health</div>
          <div class="ch-title-row">
            <span class="ch-score ${bandClass}" aria-label="Health score ${score} out of 100">${escapeHtml(String(score))}</span>
            <span class="ch-score-max">/100</span>
            <span class="ch-band-pill ${bandClass}">${escapeHtml(band.label)}</span>
          </div>
          <p class="ch-hint">${escapeHtml(band.hint)}</p>
        </div>
        <div class="ch-gauge" aria-hidden="true">
          <div class="ch-gauge-track">
            <div class="ch-gauge-fill ch-gauge-fill--${escapeHtml(band.id)}" style="width:${barPct}%"></div>
          </div>
          <div class="ch-gauge-labels">
            <span>0</span><span>50</span><span>100</span>
          </div>
        </div>
      </div>
      <div class="ch-stats">
        ${stat(overdue.length, "Overdue", overdue.length ? "bad" : "neutral")}
        ${stat(dueSoon.length, `≤${soonDays}d`, dueSoon.length ? "warn" : "neutral")}
        ${stat(onTrack, "On track", "good")}
        ${stat(noDate, "Unscheduled", noDate ? "muted" : "neutral")}
      </div>
      <p class="ch-meta">${escapeHtml(String(total))} obligation${total === 1 ? "" : "s"} in your calendar</p>
      <div class="ch-alerts">${alertRows}</div>
    </div>`;
}

export function renderComplianceHealthInlineHtml(health) {
  if (health.empty) {
    return `<div class="ch-inline ch-inline--empty" id="cal-health-inline"></div>`;
  }

  const { score, band, overdue, dueSoon, onTrack, noDate, alerts, soonDays } = health;
  const top = alerts[0];
  const bandClass = `ch-band--${band.id}`;

  const mini = `
    <div class="ch-inline-stats">
      <span class="ch-inline-pill ch-inline-pill--bad" title="Overdue">${escapeHtml(String(overdue.length))} overdue</span>
      <span class="ch-inline-pill ch-inline-pill--warn" title="Due soon">${escapeHtml(String(dueSoon.length))} due ≤${soonDays}d</span>
      <span class="ch-inline-pill ch-inline-pill--ok">${escapeHtml(String(onTrack))} on track</span>
      ${noDate ? `<span class="ch-inline-pill ch-inline-pill--muted">${escapeHtml(String(noDate))} unscheduled</span>` : ""}
    </div>`;

  const alertLine = top
    ? `<div class="ch-inline-alert ch-inline-alert--${escapeHtml(top.level)}">${escapeHtml(top.title)} — ${escapeHtml(top.body)}</div>`
    : "";

  return `
    <div class="ch-inline" id="cal-health-inline">
      <div class="ch-inline-row">
        <div class="ch-inline-score ${bandClass}">
          <span class="ch-inline-num">${escapeHtml(String(score))}</span>
          <span class="ch-inline-denom">/100</span>
        </div>
        <div class="ch-inline-bar-wrap">
          <div class="ch-inline-bar"><div class="ch-inline-bar-fill ch-inline-bar-fill--${escapeHtml(band.id)}" style="width:${score}%"></div></div>
          <span class="ch-inline-band">${escapeHtml(band.label)}</span>
        </div>
        ${mini}
      </div>
      ${alertLine}
    </div>`;
}
