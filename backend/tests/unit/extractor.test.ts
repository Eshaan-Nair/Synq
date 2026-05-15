import { extractEntitiesFromQuery, _resetBackendForTest } from "../../src/services/extractor";
import axios from "axios";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("Entity Extractor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetBackendForTest();
    process.env.GROQ_API_KEY = "test-key";
  });

  it("should extract entities using Ollama when available", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { models: [] } }); // Mock Ollama detection success
    mockedAxios.post.mockResolvedValueOnce({
      data: { response: '["AuthService", "JWT", "Redis"]' }
    });

    const entities = await extractEntitiesFromQuery("How does AuthService use JWT with Redis?");
    expect(entities).toContain("AuthService");
    expect(entities).toContain("JWT");
    expect(entities).toContain("Redis");
    expect(mockedAxios.post).toHaveBeenCalled();
  });

  it("should fallback to Groq if Ollama fails", async () => {
    // 1. Ollama is detected initially
    mockedAxios.get.mockResolvedValueOnce({ data: { models: [] } });
    
    // 2. Ollama fails during the actual call
    const connErr = new Error("Ollama connection refused");
    (connErr as any).code = "ECONNREFUSED";
    mockedAxios.post.mockRejectedValueOnce(connErr);
    // Groq succeeds
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        choices: [{ message: { content: '["AuthService", "JWT"]' } }]
      }
    });

    const entities = await extractEntitiesFromQuery("How does AuthService use JWT?");
    expect(entities).toEqual(["AuthService", "JWT"]);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it("should return empty array if all LLMs fail", async () => {
    mockedAxios.post.mockRejectedValue(new Error("Total failure"));

    const entities = await extractEntitiesFromQuery("Some query");
    expect(entities).toEqual([]);
  });

  it("should handle malformed JSON from LLM", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { response: 'This is not JSON' }
    });

    const entities = await extractEntitiesFromQuery("Some query");
    expect(entities).toEqual([]);
  });
});
