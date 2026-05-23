# ARCRIFT Benchmarking & Stress-Testing Suite

Welcome to the **ARCRIFT Benchmarking and Testing Suite**. ARCRIFT utilizes a series of highly automated diagnostic utilities, audits, and stress-tests to verify RAG recall, system limits, graph rendering efficiency, and multi-project tenant isolation.

This document serves as the single source of truth for running all performance, security, and rendering audits.

---

## Benchmark Commands

All benchmark scripts are located in the `backend/` directory. Ensure you have installed the backend dependencies (`npm install` inside the `backend` folder) before executing these commands.

| Test Category | Execution Command | Target Script | Purpose / Scope | Generated Report |
| :--- | :--- | :--- | :--- | :--- |
| **Graph Density Stress Test** | `npm run stress-test` | `generate-stress-test.ts` | Generates 1,200+ dense nodes and triples (Hubs, Clusters, Orphans) to verify canvas rendering load speed (<1.5s) and physics engine stability. | [`reports/graph_stress_test.md`](./reports/graph_stress_test.md) |
| **RAG Recall & Hybrid Search Audit** | `npm run benchmark:audit` | `rag-audit.ts` | Benchmarks retrieval recall and precision using hybrid FTS5 + Vector search against a massive 1,000-chunk noise haystack. | [`reports/benchmark_web.md`](./reports/benchmark_web.md) |
| **MCP Context Compression Benchmark** | `npm run benchmark:mcp` | `mcp-benchmark.ts` | Evaluates Model Context Protocol (MCP) prompt compression rates, precision, and agent latency using surgical sentence-level trimming. | [`reports/benchmark_mcp.md`](./reports/benchmark_mcp.md) |
| **MCP Project Isolation Security Test** | `npx ts-node scripts/mcp-stress-test.ts` | `mcp-stress-test.ts` | Spawns a live MCP process and issues concurrent JSON-RPC requests across 10 virtual projects to audit data isolation and cross-project memory leakage. | [`reports/mcp_stress_test.md`](./reports/mcp_stress_test.md) |
| **MCP Capability Compliance Audit** | `npm run mcp:audit` | `mcp-audit.ts` | Validates MCP tool definitions, JSON-RPC compliance, protocol version schemas, and capability announcements against the SDK specification. | *Console Output* |
| **MCP Server Setup Hook** | `npm run mcp:setup` | `mcp-setup.ts` | Installs, registers, and provisions target system context hooks for developer tools and active servers. | *Console Output* |
| **Standard Jest Integration Tests** | `npm run test:integration` | `tests/integration/` | Executes fully isolated database integration tests, verifying multi-engine adapters and SQLite/Neo4j storage mechanisms. | *Jest Console Output* |

---

## Step-by-Step Benchmarking Walkthrough

### 1. High Density Graph Stress Test
Generates a highly complex multi-tier graph including dense clusters, distributed networks, and orphan nodes. Perfect for testing layout engines.
```powershell
cd backend
npm run stress-test
```
* **Expected Result:** Generates a complete graph database segment and produces a metric breakdown in `reports/graph_stress_test.md`.

### 2. Multi-Tenant Project Isolation Test
Verifies that ARCRIFT never leaks context or memories between different projects (tenants). It writes secret keys into 10 separate projects and actively runs queries to ensure that none of the projects can access another project's secret key.
```powershell
cd backend
npx ts-node scripts/mcp-stress-test.ts
```
* **Expected Result:** All 10 project contexts verify successful data isolation, and `reports/mcp_stress_test.md` certifies **100% Isolation Integrity (Negative Leaks)**.

### 3. RAG Search Recall Audit
Executes a precision retrieval stress-test evaluating the effectiveness of ArcRift's **Surgical Sentence-Level Trimming** (hybrid FTS5 + Vector + Chunk search).
```powershell
cd backend
npm run benchmark:audit
```
* **Expected Result:** Audits a simulated vector space, outputting precision metrics and token savings charts in `reports/benchmark_web.md`.

---

## Summary Metrics & Targets

When running benchmarks, ARCRIFT targets these elite performance thresholds:

> [!IMPORTANT]
> * **Context Compression:** **>75%** (removing non-essential narrative tokens to optimize agent context window).
> * **RAG Search Recall:** **>90%** (zero missed relevant concepts under high density noise).
> * **Project Isolation:** **100%** (absolute zero cross-project leakage).
> * **Graph Rendering Load:** **<1.5s** (canvas rendering response under 1,200+ nodes).

---

> [!TIP]
> All reports are saved in markdown format directly inside the `reports/` folder at the root of the project. If you are modifying the RAG pipeline or storage adapter schemas, always re-run `npm run test:integration` and `npx ts-node scripts/mcp-stress-test.ts` to ensure no regression was introduced.
