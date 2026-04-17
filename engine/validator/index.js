const logger = require("../utils/logger");

function validate(parsedData) {
  logger.info("Validator", "Validating parsed data");
  
  const errors = [];

  if (!parsedData.title || parsedData.title.trim().length === 0) {
    errors.push("Title is empty");
  }

  if (!parsedData.content || parsedData.content.length < 50) {
    errors.push("Content is too short or empty (min 50 chars)");
  }

  // Basic date validation, could be improved with moment/date-fns
  if (!parsedData.date) {
    errors.push("Date is missing");
  }

  const isValid = errors.length === 0;

  if (!isValid) {
    logger.warn("Validator", "Validation failed", { errors });
  } else {
    logger.debug("Validator", "Validation passed");
  }

  return {
    isValid,
    errors
  };
}

module.exports = {
  validate
};
