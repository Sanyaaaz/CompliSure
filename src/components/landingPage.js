import { renderProblemSection, renderFeaturesSection, renderScoreSection, renderPricingSection, renderCtaBand, renderFooter } from "./sections.js";
import { renderSignupSection } from "./signupSection.js";

export function renderLandingPage(state) {
  const isDetailsOnlyLogin = Boolean(state.flags?.detailsOnlyLogin);
  const ctaLabel = isDetailsOnlyLogin ? "Open dashboard without OTP →" : "Sign up with Aadhaar →";
  const heroPrimaryLabel = isDetailsOnlyLogin ? "Login without Aadhaar OTP" : "Sign up with Aadhaar";
  const accessStat = isDetailsOnlyLogin
    ? { value: "Direct", label: "Temporary dashboard access without OTP" }
    : { value: "OTP", label: "Dashboard stays locked until verified" };

  return `
    <div class="app-shell">
      <nav>
        <a class="logo" href="#">Compli<span>Sure</span></a>
        <ul class="nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#signup">Sign up</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li><a href="#ca">For CAs</a></li>
        </ul>
        <a class="nav-btn" href="#signup">${ctaLabel}</a>
      </nav>

      <section class="hero">
        <div class="hero-glow"></div>
        <div class="hero-tag"><span class="hero-tag-dot"></span>Early access · Indian SMEs &amp; CAs</div>
        <h1>Never miss a filing.<br /><span class="italic">Ever again.</span></h1>
        <p class="hero-sub">CompliSure gives your Pvt Ltd a personalised compliance calendar across MCA, GST, Labour, and Tax — with proactive alerts to both you and your CA.</p>
        <div class="hero-btns">
          <a class="btn-green" href="#signup">${heroPrimaryLabel} <span>→</span></a>
          <a class="btn-outline" href="#features">Explore the platform</a>
        </div>
        <div class="hero-stats">
          <div class="stat"><div class="stat-n">180+</div><div class="stat-l">Statutory obligations for a Pvt Ltd</div></div>
          <div class="stat"><div class="stat-n">30–45</div><div class="stat-l">That actually apply to you</div></div>
          <div class="stat"><div class="stat-n">₹47k</div><div class="stat-l">Avg penalty for one missed DPT-3</div></div>
          <div class="stat"><div class="stat-n">${accessStat.value}</div><div class="stat-l">${accessStat.label}</div></div>
        </div>
      </section>

      ${renderSignupSection(state)}
      ${renderProblemSection()}
      ${renderFeaturesSection()}
      ${renderScoreSection()}
      ${renderPricingSection()}
      ${renderCtaBand()}
      ${renderFooter()}
    </div>
  `;
}
