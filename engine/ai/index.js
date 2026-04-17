const logger = require("../utils/logger");

// In a real scenario, this would call the Gemini API or OpenAI API
// using the text content to extract structured rules.
async function interpret(text) {
  logger.info("AI", "Interpreting legal text via LLM");

  try {
    // Simulate API call delay
    await new Promise(res => setTimeout(res, 1000));

    // Simulated LLM parsing logic based on keywords
    let action = "Review compliance requirements.";
    let deadline = "Immediate";
    let risk = "Standard non-compliance penalties apply.";
    let affected_conditions = {
      gst_registered: true
    };

    if (text.toLowerCase().includes("turnover") && text.includes("50")) {
      affected_conditions.turnover_gt = 50000000; // 5 Cr in INR roughly
      action = "File additional turnover declaration annexure.";
      deadline = "End of current financial quarter.";
      risk = "Penalty of up to INR 50,000 for late filing.";
    }

    if (text.toLowerCase().includes("mca")) {
      affected_conditions.type = "Private Limited";
      action = "Submit updated director KYC forms.";
    }

    const result = {
      affected_conditions,
      action,
      deadline,
      risk,
      confidence_score: 0.92
    };

    logger.debug("AI", "LLM Output structured successfully", result);
    return result;

  } catch (error) {
    logger.error("AI", "Failed to interpret text", { error: error.message });
    throw error;
  }
}

module.exports = {
  interpret
};
