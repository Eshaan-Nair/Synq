import { llm, _resetBackendForTest } from "../services/extractor";
import axios from "axios";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("LLM Robustness (Offline & Fallback)", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    _resetBackendForTest();
    process.env.GROQ_API_KEY = "test-groq-key";
    delete process.env.GRAPH_BACKEND;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should retry on network timeout and eventually succeed", async () => {
    process.env.GRAPH_BACKEND = "ollama";
    mockedAxios.get.mockResolvedValue({ data: { models: [] } }); // Ollama probe
    
    // 1st call: Ollama generation (timeout)
    mockedAxios.post.mockRejectedValueOnce({ code: "ECONNABORTED", message: "timeout" });
    // 2nd call: Ollama generation (success)
    mockedAxios.post.mockResolvedValueOnce({ data: { response: "Success" } });

    const llmPromise = llm("test prompt");
    
    // Fast-forward through the 15s retry delay
    await jest.advanceTimersByTimeAsync(16000);

    const result = await llmPromise;
    expect(result).toBe("Success");
  });

  it("should fallback to Groq if Ollama is not running", async () => {
    // 1. Ollama probe fails
    mockedAxios.get.mockRejectedValueOnce({ code: "ECONNREFUSED" });
    // 2. Local OpenAI probe fails
    mockedAxios.get.mockRejectedValueOnce({ code: "ECONNREFUSED" });
    
    // 3. Groq call succeeds
    mockedAxios.post.mockResolvedValueOnce({
      data: { choices: [{ message: { content: "Groq Success" } }] }
    });

    const result = await llm("test prompt");
    expect(result).toBe("Groq Success");
  });
});
