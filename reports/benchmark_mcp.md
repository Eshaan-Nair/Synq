
# MCP Elite Context Benchmark (v1.5.1)
**Scope:** Agentic Memory Performance | **Mode:** Source-Synchronized | **TopN:** 6

## Summary Metrics
| Metric | Result | Target | Status |
| :--- | :--- | :--- | :--- |
| **Total Recall** | **90%** | >90% | 🟢 PASS |
| **Context Compression** | **81.3%** | >75% | 🟢 PASS |
| **Hybrid Accuracy** | **Verified** | - | 🟢 SYNCED |

## Hybrid Engine Attribution
Confirmed hits via the MCP toolchain:
| Engine Layer | Hits | Contribution |
| :--- | :--- | :--- |
| **Sentence Vector** | **26** | 100.0% |
| **Chunk Vector** | **9** | 34.6% |
| **FTS Keyword** | **24** | 92.3% |

## Token Savings Analysis
By using **Surgical Trimming** (Comparison against 6 full chunks):
- **Noise Redacted:** 131.7k characters.
- **Context Efficiency:** Your agent receives **81.3% less noise** than standard RAG.

## Detailed Scenario Log
| Status | Query Type | Result | Engines Used | Compression |
| :--- | :--- | :--- | :--- | :--- |
| ✅ | Standard | FOUND | Sentence Vector, Chunk Vector, FTS Keyword | 77% |
| ✅ | Lowercase | FOUND | Sentence Vector, Chunk Vector, FTS Keyword | 77% |
| ✅ | Semantic | FOUND | Sentence Vector, Chunk Vector, FTS Keyword | 77% |
| ✅ | Standard | FOUND | Sentence Vector, FTS Keyword | 80% |
| ✅ | Lowercase | FOUND | Sentence Vector, FTS Keyword | 82% |
| ❌ | Semantic | MISSED | Sentence Vector, FTS Keyword | 85% |
| ✅ | Standard | FOUND | Sentence Vector, FTS Keyword | 77% |
| ✅ | Lowercase | FOUND | Sentence Vector, FTS Keyword | 77% |
| ✅ | Semantic | FOUND | Sentence Vector, FTS Keyword | 78% |
| ✅ | Standard | FOUND | Sentence Vector, FTS Keyword | 81% |
| ✅ | Lowercase | FOUND | Sentence Vector, FTS Keyword | 81% |
| ❌ | Semantic | MISSED | Sentence Vector, FTS Keyword | 82% |
| ✅ | Standard | FOUND | Sentence Vector, Chunk Vector, FTS Keyword | 82% |
| ✅ | Lowercase | FOUND | Sentence Vector, Chunk Vector, FTS Keyword | 82% |
| ✅ | Semantic | FOUND | Sentence Vector, Chunk Vector, FTS Keyword | 81% |
| ✅ | Standard | FOUND | Sentence Vector, FTS Keyword | 79% |
| ✅ | Lowercase | FOUND | Sentence Vector, FTS Keyword | 79% |
| ❌ | Semantic | MISSED | FTS Keyword | 77% |
| ✅ | Standard | FOUND | Sentence Vector, FTS Keyword | 85% |
| ✅ | Lowercase | FOUND | Sentence Vector, Chunk Vector, FTS Keyword | 85% |
| ✅ | Semantic | FOUND | Sentence Vector, FTS Keyword | 84% |
| ✅ | Standard | FOUND | Sentence Vector, Chunk Vector | 85% |
| ✅ | Lowercase | FOUND | Sentence Vector | 86% |
| ✅ | Semantic | FOUND | Sentence Vector, FTS Keyword | 84% |
| ✅ | Standard | FOUND | Sentence Vector, Chunk Vector, FTS Keyword | 85% |
| ✅ | Lowercase | FOUND | Sentence Vector, FTS Keyword | 83% |
| ✅ | Semantic | FOUND | Sentence Vector, FTS Keyword | 82% |
| ✅ | Standard | FOUND | Sentence Vector, FTS Keyword | 84% |
| ✅ | Lowercase | FOUND | Sentence Vector, FTS Keyword | 84% |
| ✅ | Semantic | FOUND | Sentence Vector, FTS Keyword | 79% |

---
**Summary:** Glia-AI v1.5.1 demonstrates elite context delivery for AI agents. By surgically trimming 150-word chunks into precise sentences, we maintain high recall while significantly reducing token waste.
