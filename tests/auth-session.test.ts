import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  getSessionSigningKey,
  extractCookie,
  validateSameOrigin,
  SESSION_COOKIE_NAME,
} from "../src/server/auth/session.ts";

describe("Server-Side Signed Session Tokens", () => {
  const originalEnv = process.env.DASHBOARD_ADMIN_PASSWORD;
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.DASHBOARD_ADMIN_PASSWORD = "test-dashboard-secret-password";
    delete process.env.SESSION_SECRET;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DASHBOARD_ADMIN_PASSWORD = originalEnv;
    } else {
      delete process.env.DASHBOARD_ADMIN_PASSWORD;
    }
    if (originalSecret !== undefined) {
      process.env.SESSION_SECRET = originalSecret;
    } else {
      delete process.env.SESSION_SECRET;
    }
  });

  describe("getSessionSigningKey", () => {
    it("derives key deterministically from DASHBOARD_ADMIN_PASSWORD", () => {
      const key1 = getSessionSigningKey("my-pass");
      const key2 = getSessionSigningKey("my-pass");
      expect(key1.equals(key2)).toBe(true);
      expect(key1.length).toBe(32); // SHA-256 length
    });

    it("uses SESSION_SECRET when explicitly configured", () => {
      process.env.SESSION_SECRET = "custom-configured-long-secret-key-123";
      const key = getSessionSigningKey();
      expect(key.toString("utf-8")).toBe("custom-configured-long-secret-key-123");
    });

    it("throws error when neither password nor secret is available", () => {
      delete process.env.DASHBOARD_ADMIN_PASSWORD;
      delete process.env.SESSION_SECRET;
      expect(() => getSessionSigningKey()).toThrow("Cannot derive session key");
    });
  });

  describe("createSessionToken & verifySessionToken", () => {
    it("creates a signed token and verifies it successfully", () => {
      const token = createSessionToken(3600);
      expect(typeof token).toBe("string");
      expect(token).toContain(".");

      const session = verifySessionToken(token);
      expect(session).not.toBeNull();
      expect(session?.exp).toBeGreaterThan(Date.now());
      expect(typeof session?.sid).toBe("string");
    });

    it("rejects token with tampered payload", () => {
      const token = createSessionToken(3600);
      const [, signature] = token.split(".");

      // Modify payload
      const tamperedPayload = Buffer.from(
        JSON.stringify({ iat: Date.now(), exp: Date.now() + 100000, sid: "fake" })
      ).toString("base64url");

      const tamperedToken = `${tamperedPayload}.${signature}`;
      expect(verifySessionToken(tamperedToken)).toBeNull();
    });

    it("rejects token with tampered signature", () => {
      const token = createSessionToken(3600);
      const [payloadEncoded] = token.split(".");
      const tamperedToken = `${payloadEncoded}.invalid_signature_hex_1234567890`;
      expect(verifySessionToken(tamperedToken)).toBeNull();
    });

    it("rejects expired session token", () => {
      // Create token that expired 10 seconds ago
      const token = createSessionToken(-10);
      expect(verifySessionToken(token)).toBeNull();
    });

    it("rejects malformed or empty token strings", () => {
      expect(verifySessionToken("")).toBeNull();
      expect(verifySessionToken(null)).toBeNull();
      expect(verifySessionToken(undefined)).toBeNull();
      expect(verifySessionToken("invalid-token-no-dot")).toBeNull();
      expect(verifySessionToken("part1.part2.part3")).toBeNull();
    });
  });

  describe("extractCookie", () => {
    it("extracts named cookie value from Cookie header", () => {
      const cookieHeader = `other=abc; ${SESSION_COOKIE_NAME}=my-token-123; theme=dark`;
      const val = extractCookie(cookieHeader, SESSION_COOKIE_NAME);
      expect(val).toBe("my-token-123");
    });

    it("returns null if named cookie is missing", () => {
      const cookieHeader = "other=abc; theme=dark";
      expect(extractCookie(cookieHeader, SESSION_COOKIE_NAME)).toBeNull();
      expect(extractCookie(null, SESSION_COOKIE_NAME)).toBeNull();
    });
  });

  describe("validateSameOrigin", () => {
    it("accepts same-origin requests", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
      });
      expect(validateSameOrigin(req)).toBe(true);
    });

    it("rejects cross-origin requests", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        headers: {
          host: "localhost:3000",
          origin: "http://evil-attacker.com",
        },
      });
      expect(validateSameOrigin(req)).toBe(false);
    });

    it("validates referer if origin header is omitted", () => {
      const validReq = new Request("http://localhost:3000/api/auth/login", {
        headers: {
          host: "localhost:3000",
          referer: "http://localhost:3000/login",
        },
      });
      expect(validateSameOrigin(validReq)).toBe(true);

      const invalidReq = new Request("http://localhost:3000/api/auth/login", {
        headers: {
          host: "localhost:3000",
          referer: "http://evil.com/page",
        },
      });
      expect(validateSameOrigin(invalidReq)).toBe(false);
    });
  });
});
