const logger = require("../utils/logger");

function evaluateCondition(companyValue, conditionValue, operator = "eq") {
  if (operator === "eq") return companyValue === conditionValue;
  if (operator === "gt") return Number(companyValue) > Number(conditionValue);
  if (operator === "lt") return Number(companyValue) < Number(conditionValue);
  return false;
}

function matchRules(companyData, aiRules) {
  logger.debug("Matcher", `Matching rules for company ${companyData.id}`);
  const conditions = aiRules.affected_conditions;
  
  if (!conditions || Object.keys(conditions).length === 0) {
    // If no conditions, it might apply to everyone
    return true; 
  }

  for (const [key, expectedValue] of Object.entries(conditions)) {
    // Handle specific operators like turnover_gt
    if (key === "turnover_gt") {
      if (!evaluateCondition(companyData.turnover, expectedValue, "gt")) {
        return false;
      }
    } else if (key === "turnover_lt") {
      if (!evaluateCondition(companyData.turnover, expectedValue, "lt")) {
        return false;
      }
    } else {
      // Direct equality check
      if (companyData[key] !== expectedValue) {
        return false; // Mismatch on a required condition
      }
    }
  }

  // All conditions met
  return true;
}

module.exports = {
  match: matchRules
};
