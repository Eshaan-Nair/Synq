import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectMongo } from "./services/mongo";
import { connectNeo4j } from "./services/neo4j";
import contextRoutes from "./routes/context";
import graphRoutes from "./routes/graph";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api/context", contextRoutes);
app.use("/api/graph", graphRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "SYNQ backend running" });
});

// Boot
async function start() {
  await connectMongo();
  await connectNeo4j();
  app.listen(PORT, () => {
    console.log(`🚀 SYNQ backend running on port ${PORT}`);
  });
}

start();