import { renderLiveTools } from "./liveTools.js";
import { renderFooter } from "./sections.js";

export function renderDashboardPage(state) {
  const aadhaarLast4 = state.auth.aadhaarDigits.slice(-4);
  const verifiedName = state.auth.verificationProfile?.name || state.auth.fullName || "Founder";
  const isDetailsOnlyLogin = Boolean(state.flags?.detailsOnlyLogin);
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

  return `
    <div class="app-shell dashboard-shell">
      <nav>
        <a class="logo" href="#">Compli<span>Sure</span></a>
        <ul class="nav-links">
          <li><a href="#overview">Overview</a></li>
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
            <div class="dash-card-label">Identity verification</div>
            <div class="dash-card-value">Aadhaar •••• ${aadhaarLast4}</div>
            <div class="dash-card-sub">${verificationNote}</div>
          </div>
          <div class="dash-card">
            <div class="dash-card-label">Access state</div>
            <div class="dash-card-value">Dashboard open</div>
            <div class="dash-card-sub">${isDetailsOnlyLogin ? "Opened from entered details while verification is paused" : "Protected until OTP verification succeeds"}</div>
          </div>
        </div>
      </section>

      ${renderLiveTools(state)}
      ${renderFooter()}
    </div>
  `;
}
