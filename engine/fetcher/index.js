const logger = require("../utils/logger");

async function fetchWithRetry(url, options = {}, retries = 3, backoff = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      logger.info("Fetcher", `Fetching URL: ${url} (Attempt ${i + 1}/${retries})`);
      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const text = await response.text();
      logger.info("Fetcher", `Successfully fetched data from ${url}`);
      return text;
    } catch (error) {
      logger.warn("Fetcher", `Failed attempt ${i + 1} for ${url}: ${error.message}`);
      if (i < retries - 1) {
        await new Promise(res => setTimeout(res, backoff * (i + 1))); // Exponential backoff
      } else {
        logger.error("Fetcher", `All retries failed for ${url}`);
        throw error;
      }
    }
  }
}

module.exports = {
  fetch: fetchWithRetry
};
