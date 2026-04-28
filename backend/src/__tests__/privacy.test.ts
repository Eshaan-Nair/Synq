import { scrubPII } from "../utils/privacy";

describe("scrubPII", () => {
  test("redacts JWT tokens", () => {
    const input = "Token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    expect(scrubPII(input)).toContain("[REDACTED_JWT]");
    expect(scrubPII(input)).not.toContain("eyJ");
  });

  test("redacts sk- style API keys", () => {
    // bare key — no assignment prefix so the sk- regex fires, not the .env pattern
    const input = "Authorization: sk-abc123defghijklmnopqrstuvwxyz1234567890";
    expect(scrubPII(input)).toContain("[REDACTED_KEY]");
    expect(scrubPII(input)).not.toContain("sk-");
  });

  test("redacts sk- keys inside .env assignments via assignment pattern", () => {
    // key=sk-... is caught by the KEY= assignment pattern — [REDACTED] is correct
    const input = "key=sk-abc123defghijklmnopqrstuvwxyz1234567890";
    const result = scrubPII(input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("abc123defghijklmnopqrstuvwxyz1234567890");
  });

  test("redacts gsk- Groq API keys", () => {
    const input = "GROQ_API_KEY=gsk_testKeyThatIsLongEnoughToMatch1234567890abcdef";
    expect(scrubPII(input)).toContain("[REDACTED]");
  });

  test("redacts GitHub PATs", () => {
    const input = "token ghp_abcdefghijklmnopqrstuvwxyz1234567890ABCD";
    expect(scrubPII(input)).toContain("[REDACTED_GITHUB_TOKEN]");
  });

  test("redacts MongoDB connection strings", () => {
    const input = "mongodb://user:password@localhost:27017/mydb";
    expect(scrubPII(input)).toContain("[REDACTED_CONNECTION_STRING]");
    expect(scrubPII(input)).not.toContain("password");
  });

  test("redacts email addresses", () => {
    const input = "Contact me at user@example.com for help";
    expect(scrubPII(input)).toContain("[REDACTED_EMAIL]");
    expect(scrubPII(input)).not.toContain("user@example.com");
  });

  test("redacts private IP addresses", () => {
    const input = "Server running at 192.168.1.100";
    expect(scrubPII(input)).toContain("[REDACTED_INTERNAL_IP]");
  });

  test("redacts .env-style assignments", () => {
    const input = "SECRET=mysupersecretvalue\nAPI_KEY=anothervalue123";
    const result = scrubPII(input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("mysupersecretvalue");
  });

  test("does not redact normal technical text", () => {
    const input = "Using React with TypeScript and Express for the backend";
    expect(scrubPII(input)).toBe(input);
  });

  test("handles empty string", () => {
    expect(scrubPII("")).toBe("");
  });
});
