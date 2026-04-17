// Standalone agent debug — loads .env then runs the agent directly
const path = require('path');
const fs = require('fs');

// Load .env manually (same as server.js)
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key]) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

console.log('GEMINI_API_KEY set:', !!process.env.GEMINI_API_KEY);

const { runAgent } = require('./engine/agent/index');

runAgent('http://127.0.0.1:3000/mock-gov-portal', 'mca')
  .then(result => {
    console.log('\n=== AGENT RESULT ===');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(err => {
    console.error('\n=== AGENT CRASH ===');
    console.error(err);
  });
