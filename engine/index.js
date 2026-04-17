const crypto = require("crypto");
const logger = require("./utils/logger");
const notifier = require("./notifier");
const { runAgent } = require("./agent/index");

async function processSource(url, sourceName) {
  logger.info("Engine", `Starting AI Agent process pipeline for source: ${sourceName}`);
  
  try {
    // Start the agent loop
    const result = await runAgent(url, sourceName);

    logger.info("Engine", `AI Agent Pipeline completed successfully for ${sourceName}. Result: ${result.message}`);
    
    return { 
      status: "success", 
      message: result.message
    };

  } catch (error) {
    logger.error("Engine", "AI Agent Pipeline failed", { error: error.message, stack: error.stack });
    return { status: "error", message: error.message };
  }
}

module.exports = {
  processSource,
  handleCAVerification: notifier.handleCAVerification
};
