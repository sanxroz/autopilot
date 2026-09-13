import { describe, expect, test } from "bun:test";
import { isLocalWebUrl } from "../src/lib/local-web-url";

describe("isLocalWebUrl", () => {
  test("accepts HTTP localhost variants", () => {
    expect(isLocalWebUrl("http://localhost:3000/path")).toBe(true);
    expect(isLocalWebUrl("https://127.0.0.1:5173")).toBe(true);
    expect(isLocalWebUrl("http://[::1]:8080")).toBe(true);
  });

  test("rejects external, deceptive, and non-web URLs", () => {
    expect(isLocalWebUrl("https://example.com")).toBe(false);
    expect(isLocalWebUrl("http://localhost.example.com")).toBe(false);
    expect(isLocalWebUrl("javascript:alert(1)")).toBe(false);
    expect(isLocalWebUrl("not a url")).toBe(false);
  });
});
