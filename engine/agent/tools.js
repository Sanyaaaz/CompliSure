const fetcher = require("../fetcher");
const parser = require("../parser");
const db = require("../database/mockDb");
const notifier = require("../notifier");

async function fetchAndParseRegulatoryContent({ url, sourceName }) {
  const html = await fetcher.fetch(url);
  const parsedData = parser.parse(html, sourceName);
  return {
    title: parsedData.title,
    date: parsedData.date,
    content: parsedData.content
  };
}

async function getAllCompanyProfiles() {
  const companies = await db.getAllCompanies();
  return { companies };
}

async function issueRecommendations({ recommendations }) {
  let count = 0;
  for (const rec of recommendations) {
    // Decorate the recommendation with ID and timestamp if needed
    const finalRec = {
      id: `REC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      ...rec
    };
    
    // Save to DB
    await db.saveRecommendation(finalRec);
    
    // Route to CA
    await notifier.routeToCA(finalRec, finalRec.company_ca_email);
    count++;
  }
  return { status: "success", generatedRecommendations: count };
}

const toolDeclarations = [
  {
    name: "fetchAndParseRegulatoryContent",
    description: "Fetches and parses regulatory content from a given URL and source name.",
    parameters: {
      type: "OBJECT",
      properties: {
        url: { type: "STRING", description: "The URL to fetch the regulatory update from." },
        sourceName: { type: "STRING", description: "The source name (e.g., 'mca')." }
      },
      required: ["url", "sourceName"]
    }
  },
  {
    name: "getAllCompanyProfiles",
    description: "Retrieves all company profiles from the database to evaluate which companies are impacted by the regulatory rules.",
    parameters: {
      type: "OBJECT",
      properties: {},
      required: []
    }
  },
  {
    name: "issueRecommendations",
    description: "Issues compliance recommendations for companies that match the new regulatory rules.",
    parameters: {
      type: "OBJECT",
      properties: {
        recommendations: {
          type: "ARRAY",
          description: "An array of recommendation objects tailored for the matched companies.",
          items: {
            type: "OBJECT",
            properties: {
              company_id: { type: "STRING" },
              company_name: { type: "STRING" },
              company_ca_email: { type: "STRING" },
              update_title: { type: "STRING" },
              message: { type: "STRING", description: "A message explaining why they are impacted based on their profile." },
              action_required: { type: "STRING", description: "The specific action the company needs to take." },
              deadline: { type: "STRING", description: "The deadline for the action." },
              risk: { type: "STRING", description: "The risk or penalty of non-compliance." }
            },
            required: ["company_id", "company_name", "company_ca_email", "update_title", "message", "action_required", "deadline", "risk"]
          }
        }
      },
      required: ["recommendations"]
    }
  }
];

const toolImplementations = {
  fetchAndParseRegulatoryContent,
  getAllCompanyProfiles,
  issueRecommendations
};

module.exports = {
  toolDeclarations,
  toolImplementations
};
