const { extractRelevantSnippets, _resetBackendForTest } = require('./dist/services/extractor.js');
const mongoose = require('mongoose');

async function run() {
  process.env.GRAPH_BACKEND = "groq"; // Force Groq to avoid loading ollama for test
  if (!process.env.GROQ_API_KEY) {
      console.log("No GROQ_API_KEY set, test cannot run accurately. Skipping.");
      return;
  }
  const prompt = "What is the authentication token key?";
  const chunks = [
    "The system is built on React and Node.js. It uses standard web technologies.",
    "The authentication token is stored in localStorage under the key 'auth_token'. To log out, you must clear the token and redirect to /login.",
    "The application relies on MongoDB for storage and has a robust logging system."
  ];

  console.log("Running Snippet Extractor Test...");
  const result = await extractRelevantSnippets(prompt, chunks);
  console.log("\n==== Extracted Result ====\n");
  console.log(result);
  console.log("\n==========================");
  
  process.exit(0);
}

run().catch(console.error);
