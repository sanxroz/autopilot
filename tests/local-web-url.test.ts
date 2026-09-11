import { describe, expect, test } from "bun:test";
import { findLocalWebUrls, isLocalWebUrl } from "../src/lib/local-web-url";

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

describe("findLocalWebUrls", () => {
  test("extracts and normalizes local URLs from terminal output", () => {
    expect(findLocalWebUrls("  Local: \x1b[36mhttp://localhost:5173/docs/\x1b[0m\n")).toEqual([
      "http://localhost:5173/docs/",
    ]);
    expect(findLocalWebUrls("Serving at http://127.0.0.1:8765/.\n")).toEqual([
      "http://127.0.0.1:8765/",
    ]);
  });

  test("ignores external URLs and removes duplicates", () => {
    expect(findLocalWebUrls(
      "http://localhost:3000 https://example.com http://localhost:3000",
    )).toEqual(["http://localhost:3000/"]);
  });
});
