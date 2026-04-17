const logger = require("../utils/logger");

// In-memory store for pending CA verifications
const pendingVerifications = new Map();

async function routeToCA(recommendation, caEmail) {
  const verificationId = `VER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  logger.info("Notifier", `Routing to CA (${caEmail}) for verification. ID: ${verificationId}`);
  
  pendingVerifications.set(verificationId, {
    status: 'pending',
    recommendation,
    caEmail
  });

  // Simulate sending email to CA
  logger.debug("Notifier", `[Email Sent] To: ${caEmail} | Subject: Review required for ${recommendation.company_name} | Link: /verify/${verificationId}`);

  return verificationId;
}

async function handleCAVerification(verificationId, action, modifications = null) {
  const record = pendingVerifications.get(verificationId);
  if (!record) {
    throw new Error("Verification ID not found");
  }

  logger.info("Notifier", `CA responded with action: ${action} for ID: ${verificationId}`);

  if (action === "approve" || action === "edit") {
    let finalRecommendation = record.recommendation;
    
    if (action === "edit" && modifications) {
      finalRecommendation = { ...finalRecommendation, ...modifications };
    }

    record.status = "approved";
    await notifyUser(finalRecommendation);
    return { success: true, message: "Approved and user notified." };
  } else if (action === "reject") {
    record.status = "rejected";
    logger.warn("Notifier", "Recommendation rejected by CA. User will not be notified.");
    return { success: true, message: "Rejected. User not notified." };
  }

  throw new Error("Invalid action. Use 'approve', 'edit', or 'reject'.");
}

async function notifyUser(recommendation) {
  logger.info("Notifier", `Sending notification to user: ${recommendation.company_name}`);
  
  // Simulate App Dashboard Notification
  logger.debug("Notifier", `[App Alert] ${recommendation.message} Action: ${recommendation.action_required}`);
  
  // Simulate Email
  logger.debug("Notifier", `[Email Sent] To User | Subject: Action Required: ${recommendation.update_title}`);
}

module.exports = {
  routeToCA,
  handleCAVerification,
  notifyUser
};
