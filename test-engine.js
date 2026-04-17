const express = require('express');
const engine = require('./engine');

const app = express();
const PORT = 3001;

// 1. Create a dummy government website endpoint
app.get('/dummy-mca', (req, res) => {
  res.send(`
    <html>
      <body>
        <h1 class="notification-title">Important Update for Private Limited Companies</h1>
        <span class="publish-date">October 24, 2026</span>
        <div class="notification-content">
          <p>All Private Limited companies with a turnover exceeding 50000000 INR must file the new annexure form by the end of the current financial quarter.</p>
          <p>Failure to comply will result in standard penalties under section 402.</p>
        </div>
      </body>
    </html>
  `);
});

const server = app.listen(PORT, async () => {
  console.log(`\n--- DUMMY GOV SERVER RUNNING ON PORT ${PORT} ---\n`);

  console.log("-> Triggering Smart Regulatory Engine to fetch from the dummy Gov server...\n");

  // 2. Trigger the engine
  const result = await engine.processSource(`http://127.0.0.1:${PORT}/dummy-mca`, 'mca');
  
  console.log("\n--- PIPELINE RESULT ---");
  console.log(JSON.stringify(result, null, 2));

  server.close();
});
