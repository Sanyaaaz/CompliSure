const logger = require("../utils/logger");

function generateRecommendation(parsedData, aiRules, companyData) {
  logger.info("Recommender", `Generating recommendation for ${companyData.name}`);

  return {
    company_id: companyData.id,
    company_name: companyData.name,
    update_title: parsedData.title,
    message: `A new regulatory update "${parsedData.title}" applies to you because your business matches the condition: ${Object.keys(aiRules.affected_conditions).join(", ")}.`,
    action_required: aiRules.action,
    deadline: aiRules.deadline,
    risk: aiRules.risk,
    generated_at: new Date().toISOString()
  };
}

module.exports = {
  generate: generateRecommendation
};
