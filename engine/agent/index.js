const { GoogleGenAI } = require('@google/genai');
const { toolDeclarations, toolImplementations } = require('./tools');
const logger = require('../utils/logger');

async function runAgent(url, sourceName) {
  // Initialize the Google GenAI SDK here so that server.js has time to load the .env file first
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const systemInstruction = `You are an autonomous Chief Compliance Officer AI Agent. 
Your job is to process a new regulatory update URL. 
Steps you MUST take:
1. Call 'fetchAndParseRegulatoryContent' to get the text of the regulatory update.
2. Read the text and deeply understand the compliance rules, exceptions, and deadlines.
3. Call 'getAllCompanyProfiles' to get a list of companies in the database.
4. Evaluate WHICH of these companies are impacted by the rules based on their profile properties (e.g. turnover, entity type, gst registration, state).
5. Call 'issueRecommendations' to generate specific, actionable compliance recommendations ONLY for the companies that are impacted.

Do not stop until you have called 'issueRecommendations' successfully. Be precise about the action_required and risk. Return a final summary to the user when finished.`;

  try {
    const chat = ai.chats.create({
      model: 'gemini-2.0-flash',
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2,
        tools: [{ functionDeclarations: toolDeclarations }]
      }
    });

    logger.info("Agent", `Starting autonomous agent for URL: ${url}`);
    let response = await chat.sendMessage({ message: `Process the regulatory update at this URL: ${url} (Source: ${sourceName})` });
    
    // Agent loop for function calling
    while (response.functionCalls && response.functionCalls.length > 0) {
      const parts = [];
      
      for (const call of response.functionCalls) {
        logger.info("Agent", `Tool Call: ${call.name}`);
        const func = toolImplementations[call.name];
        
        if (func) {
          try {
            const result = await func(call.args);
            parts.push({
              functionResponse: {
                name: call.name,
                response: result   // must be a plain object
              }
            });
            logger.info("Agent", `Tool Call ${call.name} executed successfully.`);
          } catch (error) {
            logger.error("Agent", `Tool Call Error in ${call.name}: ${error.message}`);
            parts.push({
              functionResponse: {
                name: call.name,
                response: { error: error.message }
              }
            });
          }
        } else {
          parts.push({
            functionResponse: {
              name: call.name,
              response: { error: "Function not found" }
            }
          });
        }
      }
      
      // The SDK requires functionResponse parts wrapped in a Content object with role
      logger.info("Agent", "Sending tool responses back to Gemini...");
      response = await chat.sendMessage({
        message: { role: "user", parts }
      });
    }

    logger.info("Agent", "Agent finished task.");
    return {
      status: "success",
      message: response.text
    };
  } catch (error) {
    logger.error("Agent", "Fatal error during agent execution", { error: error.message, stack: error.stack });
    return {
      status: "error",
      message: "Agent encountered a fatal error: " + error.message
    };
  }
}

module.exports = { runAgent };
