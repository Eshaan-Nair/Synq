# Pull Request: Architectural Hardening & Security Remediation (v1.4.2)

## Title
`feat: Architectural Hardening, Security Audit & Performance Optimization (v1.4.2)`

---

## Description

This PR implements a comprehensive remediation plan following a 3-pass architectural and security audit. The goal was to transition SYNQ from a prototype-grade codebase to a robust, secure, and performant context sovereignty engine.

### 🏗️ Major Architectural Shifts

- **Async Knowledge Graph Extraction**: Migrated from blocking, sequential extraction to an **async background job queue**. The backend now returns a `202 Accepted` immediately, preventing timeout issues on long conversations.
- **Sliding Window Chunker**: Implemented a more sophisticated chunking strategy that preserves context continuity, improving RAG recall accuracy.
- **Multi-Strategy Selector Resolver**: Introduced a resilient selector system that survives platform UI updates by cascading through multiple identification strategies (testid, role, aria, placeholder).

### 🔒 Security & Privacy Hardening

- **Auth Secret Enforcement**: Standardised `X-SYNQ-Secret` authentication across the Extension, Dashboard, and MCP server. 
- **Auto-Generated Secrets**: Updated installation scripts to auto-generate unique 32-byte secrets for new installations.
- **Prompt Injection Defense**: Added a sanitisation middleware that redacts known injection patterns from RAG chunks before they reach the AI context.
- **Strict Content Security Policy (CSP)**: Implemented strict policies across the extension and dashboard to mitigate XSS risks.

### 🚀 Performance & Stability

- **Visibility-Aware Polling**: Dashboard polling now pauses when the tab is hidden, significantly reducing background resource usage.
- **D3 Simulation Optimization**: Decoupled graph settings from data-loading to allow smooth, imperative UI updates without full simulation restarts.
- **High-Performance Logging**: Migrated from `console.log` to **Pino**, providing structured JSON logs and better debugging via `pino-pretty`.
- **Global Graph Pagination**: Added limit/offset support and a `truncated` flag to the graph API to handle large datasets gracefully.

### 🧪 Quality Assurance & CI

- **Unit Test Baseline**: Added Jest tests for core logic: chunkers, validators, privacy filters, and sanitisation.
- **Fixture-Based Selector CI**: Introduced local HTML fixtures for all supported platforms. The CI now verifies selector stability against static snapshots, eliminating flaky network dependencies.
- **Dockerized CI Services**: Replaced insecure `curl | sh` scripts with official Docker services (Ollama, MongoDB) in the GitHub Actions pipeline.

---

## Verification Plan

### Automated Tests
- `npm run test` in backend to verify core logic.
- `node scripts/check-selectors.js --fixtures` to verify platform stability.
- Verified GitHub Actions pipeline passes with new Docker services.

### Manual Verification
- Verified extension `Save Chat` flow triggers background jobs.
- Confirmed Dashboard displays "Processing..." status while triples are extracted.
- Verified `X-SYNQ-Secret` headers are correctly sent by both Dashboard and Extension.
- Confirmed RAG context injection redacts "ignore previous instructions" patterns.

---

## Checklist
- [x] All 28 audit items resolved.
- [x] Unit tests passing.
- [x] Documentation (WALKTHROUGH.md) updated.
- [x] CI/CD pipeline verified.
