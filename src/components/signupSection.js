export function renderSignupSection(state) {
  const { auth } = state;

  return `
    <section id="signup" class="auth-section">
      <div class="wrap">
        <div class="auth-shell">
          <div class="auth-copy">
            <div class="eyebrow">Verified access</div>
            <h2 class="sec-title">Sign up with Aadhaar card, then unlock the dashboard with OTP</h2>
            <p class="sec-sub">We’ve added an Aadhaar-first entry flow to the landing page. The dashboard stays locked until OTP verification is completed.</p>
            <div class="auth-steps">
              <div class="auth-step"><span>1</span> Enter founder and company details</div>
              <div class="auth-step"><span>2</span> Verify Aadhaar and send OTP to the linked mobile</div>
              <div class="auth-step"><span>3</span> Open the dashboard only after OTP success</div>
            </div>
          </div>
          <div class="auth-card">
            <div class="auth-card-header">
              <div>
                <div class="auth-kicker">Founders onboarding</div>
                <h3>Secure sign up</h3>
              </div>
              <div class="auth-badge">${auth.verified ? "Verified" : auth.otpSent ? "OTP sent" : "Step 1"}</div>
            </div>
            <form id="signup-form" class="auth-form">
              <div class="field">
                <label for="founder-name">Founder name</label>
                <input id="founder-name" type="text" value="${auth.fullName}" placeholder="Aarav Mehta" />
              </div>
              <div class="field">
                <label for="company-name">Company name</label>
                <input id="company-name" type="text" value="${auth.companyName}" placeholder="Zephyr Tech Pvt Ltd" />
              </div>
              <div class="field">
                <label for="aadhaar-number">Aadhaar number</label>
                <input id="aadhaar-number" type="text" inputmode="numeric" maxlength="14" value="${auth.aadhaarDisplay}" placeholder="1234 5678 9012" />
              </div>
              <label class="consent-row">
                <input id="aadhaar-consent" type="checkbox" ${auth.consent ? "checked" : ""} />
                <span>I consent to Aadhaar OTP verification for dashboard access.</span>
              </label>
              <button class="btn-green auth-btn" id="send-otp-btn" type="button" ${auth.loading ? "disabled" : ""}>${auth.loading && auth.loadingStep === "send" ? "Sending OTP..." : "Send OTP to registered mobile"} <span>→</span></button>
              <p class="auth-helper">Aadhaar OTP now goes through the configured sandbox backend. Add your sandbox URLs, headers, and request templates in the server env file.</p>
              ${auth.message ? `<div class="auth-toast ${auth.messageType === "error" ? "auth-toast-error" : ""}">${auth.message}</div>` : ""}
              ${auth.otpSent ? `
                <div class="otp-box">
                  <div class="otp-copy">
                    <div class="otp-label">OTP verification</div>
                    <p>Enter the OTP sent to the mobile number linked with this Aadhaar to continue to your dashboard.</p>
                  </div>
                  <div class="field" style="margin-bottom:1rem">
                    <label for="otp-input">6-digit OTP</label>
                    <input id="otp-input" type="text" inputmode="numeric" maxlength="6" value="${auth.otpInput}" placeholder="Enter OTP" />
                  </div>
                  <div class="otp-actions">
                    <button class="btn-green auth-btn" id="verify-otp-btn" type="button" ${auth.loading ? "disabled" : ""}>${auth.loading && auth.loadingStep === "verify" ? "Verifying..." : "Verify OTP & open dashboard"} <span>→</span></button>
                    <button class="btn-outline auth-btn-secondary" id="edit-signup-btn" type="button" ${auth.loading ? "disabled" : ""}>Edit details</button>
                  </div>
                </div>
              ` : ""}
            </form>
          </div>
        </div>
      </div>
    </section>
  `;
}
