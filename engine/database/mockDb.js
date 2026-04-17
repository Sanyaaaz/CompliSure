// In-memory mock database for the engine

const seenHashes = new Set();

const companies = [
  {
    id: "COMP001",
    name: "Tech Innovators Pvt Ltd",
    gst_registered: true,
    turnover: 60000000,
    employees: 50,
    state: "Maharashtra",
    type: "Private Limited",
    ca_email: "ca@example.com"
  },
  {
    id: "COMP002",
    name: "Local Shop",
    gst_registered: false,
    turnover: 1500000,
    employees: 3,
    state: "Delhi",
    type: "Sole Proprietorship",
    ca_email: "ca2@example.com"
  }
];

const recommendations = [];
let mockGovPortalContent = {
  title: "Welcome to the Mock Gov Portal",
  date: new Date().toISOString(),
  content: "No recent updates."
};

module.exports = {
  // Update Hashes
  hasSeenUpdate: async (hash) => {
    return seenHashes.has(hash);
  },
  markUpdateSeen: async (hash) => {
    seenHashes.add(hash);
  },
  
  // Companies
  getAllCompanies: async () => {
    return companies;
  },
  getCompanyById: async (id) => {
    return companies.find(c => c.id === id);
  },

  // Recommendations
  saveRecommendation: async (rec) => {
    recommendations.unshift(rec); // Add to beginning
  },
  getRecommendations: async () => {
    return recommendations;
  },

  // Mock Gov Portal Simulator
  setMockGovPortal: async (title, content) => {
    mockGovPortalContent = {
      title,
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      content
    };
  },
  getMockGovPortal: async () => {
    return mockGovPortalContent;
  }
};
