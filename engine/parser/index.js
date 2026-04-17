const cheerio = require("cheerio");
const logger = require("../utils/logger");
const selectorsConfig = require("../config/selectors.json");

function parseHTML(html, sourceName) {
  logger.info("Parser", `Parsing HTML for source: ${sourceName}`);
  const $ = cheerio.load(html);
  const config = selectorsConfig[sourceName];

  if (!config) {
    logger.error("Parser", `No selector config found for source: ${sourceName}`);
    throw new Error(`No config for ${sourceName}`);
  }

  const result = {
    title: null,
    date: null,
    content: null
  };

  // Helper to try selectors in order
  const extractText = (selectors) => {
    for (const selector of selectors) {
      const text = $(selector).text().trim();
      if (text) {
        // Clean text by replacing multiple newlines and spaces
        return text.replace(/\s+/g, " ");
      }
    }
    return null;
  };

  result.title = extractText(config.title);
  result.date = extractText(config.date);
  result.content = extractText(config.content);

  logger.debug("Parser", "Extraction result", { 
    hasTitle: !!result.title, 
    hasDate: !!result.date, 
    contentLength: result.content ? result.content.length : 0 
  });

  return result;
}

module.exports = {
  parse: parseHTML
};
