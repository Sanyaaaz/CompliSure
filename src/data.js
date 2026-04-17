export const COMPLIANCE_DB = {
  base: [
    { name: "MGT-7 — Annual Return", dept: "MCA", due: "Sep 2026", urgency: "a", pen: "₹100/day (dir. liability)", dir: true },
    { name: "AOC-4 — Financial Statements", dept: "MCA", due: "Oct 2026", urgency: "a", pen: "₹100/day", dir: true },
    { name: "DIR-3 KYC — All Directors", dept: "MCA", due: "Sep 2026", urgency: "a", pen: "₹5,000 flat + DIN deactivation", dir: true },
    { name: "Advance Tax — Q1", dept: "Income Tax", due: "15 Jun", urgency: "a", pen: "1% per month (Sec 234B/C)" },
    { name: "Advance Tax — Q2", dept: "Income Tax", due: "15 Sep", urgency: "g", pen: "1% per month" },
    { name: "ITR — Income Tax Return", dept: "Income Tax", due: "31 Oct", urgency: "g", pen: "₹5,000 (late fee)" },
    { name: "TDS Return — Q4 (26Q)", dept: "Income Tax", due: "31 May", urgency: "a", pen: "₹200/day (Sec 234E)" }
  ],
  gst_regular: [
    { name: "GSTR-1 — Outward Supplies", dept: "GST", due: "11th every month", urgency: "r", pen: "₹50/day (min ₹1,000)" },
    { name: "GSTR-3B — Monthly Return", dept: "GST", due: "20th every month", urgency: "r", pen: "₹50/day (min ₹1,000)" },
    { name: "GSTR-9 — Annual Return", dept: "GST", due: "31 Dec", urgency: "g", pen: "₹200/day (max 0.25% turnover)" }
  ],
  gst_composition: [
    { name: "GSTR-4 — Composition Return", dept: "GST", due: "30 Apr", urgency: "r", pen: "₹200/day" }
  ],
  emp_1_9: [
    { name: "PT Registration", dept: "Professional Tax", due: "Within 30 days of hire", urgency: "a", pen: "₹5,000 flat" }
  ],
  emp_10plus: [
    { name: "PF Registration (EPFO)", dept: "Labour / PF", due: "Within 30 days of 10th hire", urgency: "r", pen: "₹5,000 + 12% contribution interest", dir: true },
    { name: "PF Challan — Monthly", dept: "Labour / PF", due: "15th every month", urgency: "r", pen: "12% p.a. interest + ₹5,000 penalty" },
    { name: "PT Registration & Challan", dept: "Professional Tax", due: "State-specific", urgency: "a", pen: "₹5,000 flat" }
  ],
  emp_20plus: [
    { name: "ESI Registration", dept: "Labour / ESI", due: "Within 15 days of 20th hire", urgency: "r", pen: "₹5,000 per director per day", dir: true },
    { name: "ESI Challan — Monthly", dept: "Labour / ESI", due: "21st every month", urgency: "r", pen: "₹5,000 + simple interest" }
  ],
  deposits: [
    { name: "DPT-3 — Return of Deposits", dept: "MCA", due: "30 Jun annually", urgency: "r", pen: "₹47,000+ (₹25k company + ₹1k/day, dir. personally liable)", dir: true }
  ],
  state_MH: [
    { name: "Maharashtra Shop & Estab. Registration", dept: "Shop Act (MH)", due: "Within 30 days of opening", urgency: "a", pen: "₹2,000–₹5,000" },
    { name: "Maharashtra PT Challan — Monthly", dept: "Prof. Tax (MH)", due: "Last day of month", urgency: "r", pen: "₹300 + 1.25%/month" }
  ],
  state_KA: [
    { name: "Karnataka S&E Registration", dept: "Shop Act (KA)", due: "Before commencing business", urgency: "r", pen: "₹5,000 flat" },
    { name: "Karnataka PT Challan — Monthly", dept: "Prof. Tax (KA)", due: "20th every month", urgency: "r", pen: "₹100/day" }
  ],
  state_DL: [
    { name: "Delhi S&E Registration", dept: "Shop Act (DL)", due: "Within 30 days of opening", urgency: "a", pen: "₹2,000 flat" }
  ],
  state_TN: [
    { name: "Tamil Nadu PT Registration", dept: "Prof. Tax (TN)", due: "Within 30 days of hire", urgency: "a", pen: "₹1,000 + arrears" }
  ]
};

export const PENALTY_DATA = {
  "MGT-7": { base: 100, daily: 100, dir: true, max: null, note: "Under Sec 92(5) Companies Act" },
  "AOC-4": { base: 100, daily: 100, dir: true, max: null, note: "Under Sec 137(3) Companies Act" },
  "DPT-3": { base: 25000, daily: 500, dir: true, max: null, note: "Company ₹25k + every officer ₹1k/day" },
  "GSTR-3B": { base: 1000, daily: 50, dir: false, max: 5000, note: "Min ₹1,000; max ₹5,000 per return" },
  ITR: { base: 5000, daily: 0, dir: false, max: 10000, note: "₹5k if filed before Dec 31; ₹10k after" },
  TDS: { base: 200, daily: 200, dir: true, max: null, note: "Sec 234E ₹200/day up to TDS amount" },
  PF: { base: 5000, daily: 75, dir: true, max: null, note: "₹5,000 + 12% p.a. on arrears" },
  ESI: { base: 5000, daily: 100, dir: true, max: null, note: "₹5,000 per default + interest" },
  "DIR-12": { base: 100, daily: 100, dir: true, max: null, note: "Under Sec 168/169 Companies Act" }
};

export const SAMPLE_NOTICE = `This is to inform that your company M/s Zephyr Tech Pvt Ltd (CIN: U72200KA2021PTC134567) has failed to file Form MGT-7 (Annual Return) for the financial year 2022-23 within the prescribed time under Section 92(4) of the Companies Act, 2013.

A penalty of ₹100 per day has been levied under Section 92(5) from the due date of filing. The total outstanding penalty amount as on date is ₹18,200.

You are hereby directed to file the required return and pay the penalty amount within 30 days from the date of this notice. Failure to comply may result in prosecution proceedings and disqualification of directors under Section 164(2) of the Companies Act.`;

export const NOTICE_PATTERNS = [
  { pattern: /MGT-7|annual.?return/i, type: "MCA penalty notice", reason: "Annual Return (MGT-7) was not filed within 60 days of AGM", action: "File MGT-7 on MCA portal and pay penalty challan", urgency: "HIGH", deadline: "30 days from notice date", ca: "Company Secretary / CA strongly recommended" },
  { pattern: /AOC-4|financial.?stat/i, type: "MCA penalty notice", reason: "Financial Statements (AOC-4) not filed within 30 days of AGM", action: "File AOC-4 on MCA portal immediately", urgency: "HIGH", deadline: "30 days from notice date", ca: "CA required for signing the financial statements" },
  { pattern: /DPT-3|deposit/i, type: "MCA deposits notice", reason: "DPT-3 (Return of Deposits) not filed by June 30", action: "File DPT-3 on MCA portal and pay accumulated penalty", urgency: "CRITICAL — Director personally liable", deadline: "Immediate", ca: "CA / CS required; do not delay" },
  { pattern: /GSTR|GST|tax.?invoice/i, type: "GST demand notice", reason: "GST return not filed or discrepancy in GSTR-1 vs GSTR-3B", action: "File pending return and respond on GST portal", urgency: "HIGH", deadline: "As specified in notice (usually 30 days)", ca: "GST practitioner / CA recommended" },
  { pattern: /TDS|194|192|26Q|24Q/i, type: "TDS demand notice", reason: "TDS return not filed or short deduction/deposit", action: "File overdue TDS return and deposit shortfall with interest", urgency: "MEDIUM-HIGH", deadline: "30 days from notice date", ca: "Tax consultant recommended" },
  { pattern: /PF|provident.?fund|EPFO/i, type: "PF compliance notice", reason: "PF contribution not deposited or registration not done", action: "Deposit PF amount immediately and register with EPFO", urgency: "HIGH — Directors personally liable", deadline: "Immediate", ca: "Labour consultant / CA recommended" },
  { pattern: /section.?164|director.?disqualif/i, type: "Director disqualification notice", reason: "Company has failed to file returns for 3+ consecutive years", action: "File all pending returns and apply for DIN reactivation", urgency: "CRITICAL", deadline: "Immediate", ca: "Company Secretary essential — legal counsel advised" }
];

export const DEFAULT_CA_ROWS = [
  { client: "Zephyr Tech Pvt Ltd", filing: "GSTR-3B — April", dept: "GST", due: "20 Apr", dueTone: "red", status: "overdue" },
  { client: "Novacraft LLP", filing: "TDS Return Q4", dept: "Income Tax", due: "30 Apr", dueTone: "amber", status: "inprogress" },
  { client: "Merkle Biotech Pvt Ltd", filing: "PF Challan — March", dept: "Labour", due: "15 Apr", dueTone: "red", status: "overdue" },
  { client: "Stackline Pvt Ltd", filing: "DIR-3 KYC", dept: "MCA", due: "30 Apr", dueTone: "amber", status: "pending" },
  { client: "Zephyr Tech Pvt Ltd", filing: "GSTR-1 — April", dept: "GST", due: "11 Apr", dueTone: "green", status: "filed" }
];
