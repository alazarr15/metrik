import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  safeCompareSecret,
  extractClientCredential,
  validateApiAccess,
} from "../src/server/auth/guard.ts";

describe("Centralized API Security Guard", () => {
  const originalEnv = process.env.DASHBOARD_ADMIN_PASSWORD;

  beforeEach(() => {
    delete process.env.DASHBOARD_ADMIN_PASSWORD;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DASHBOARD_ADMIN_PASSWORD = originalEnv;
    } else {
      delete process.env.DASHBOARD_ADMIN_PASSWORD;
    }
  });

  describe("safeCompareSecret", () => {
    it("returns true for matching strings", () => {
      expect(safeCompareSecret("super-secret", "super-secret")).toBe(true);
    });

    it("returns false for different strings of equal length", () => {
      expect(safeCompareSecret("super-secret", "super-secrez")).toBe(false);
    });

    it("returns false for strings of different length without throwing RangeError", () => {
      expect(safeCompareSecret("short", "much-longer-secret-value")).toBe(false);
      expect(safeCompareSecret("longer-provided-value", "short")).toBe(false);
    });

    it("handles non-string arguments safely", () => {
      // @ts-expect-error test invalid types
      expect(safeCompareSecret(null, "secret")).toBe(false);
      // @ts-expect-error test invalid types
      expect(safeCompareSecret("secret", undefined)).toBe(false);
    });
  });

  describe("extractClientCredential", () => {
    it("extracts token from Bearer Authorization header", () => {
      const req = new Request("http://localhost:3000/api/channels", {
        headers: { authorization: "Bearer my-secret-token" },
      });
      expect(extractClientCredential(req)).toBe("my-secret-token");
    });

    it("handles case-insensitive Bearer prefix", () => {
      const req = new Request("http://localhost:3000/api/channels", {
        headers: { authorization: "bearer my-token" },
      });
      expect(extractClientCredential(req)).toBe("my-token");
    });

    it("extracts token from x-admin-password header", () => {
      const req = new Request("http://localhost:3000/api/channels", {
        headers: { "x-admin-password": "custom-password" },
      });
      expect(extractClientCredential(req)).toBe("custom-password");
    });

    it("returns null when no credential headers are present", () => {
      const req = new Request("http://localhost:3000/api/channels");
      expect(extractClientCredential(req)).toBe(null);
    });
  });

  describe("validateApiAccess", () => {
    it("fails closed with 503 SERVER_MISCONFIGURED when DASHBOARD_ADMIN_PASSWORD is unset", async () => {
      delete process.env.DASHBOARD_ADMIN_PASSWORD;

      const req = new Request("http://localhost:3000/api/channels", {
        headers: { authorization: "Bearer some-password" },
      });

      const res = validateApiAccess(req);
      expect(res.authorized).toBe(false);
      expect(res.response).toBeDefined();
      expect(res.response!.status).toBe(503);

      const json = await res.response!.json();
      expect(json.error.code).toBe("SERVER_MISCONFIGURED");
    });

    it("fails closed with 503 SERVER_MISCONFIGURED when DASHBOARD_ADMIN_PASSWORD is empty string", async () => {
      process.env.DASHBOARD_ADMIN_PASSWORD = "   ";

      const req = new Request("http://localhost:3000/api/channels", {
        headers: { authorization: "Bearer test" },
      });

      const res = validateApiAccess(req);
      expect(res.authorized).toBe(false);
      expect(res.response!.status).toBe(503);
    });

    it("returns 401 UNAUTHORIZED when client credentials are missing", async () => {
      process.env.DASHBOARD_ADMIN_PASSWORD = "production-admin-password";

      const req = new Request("http://localhost:3000/api/channels");

      const res = validateApiAccess(req);
      expect(res.authorized).toBe(false);
      expect(res.response!.status).toBe(401);

      const json = await res.response!.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 UNAUTHORIZED when client credentials do not match", async () => {
      process.env.DASHBOARD_ADMIN_PASSWORD = "production-admin-password";

      const req = new Request("http://localhost:3000/api/channels", {
        headers: { authorization: "Bearer wrong-password" },
      });

      const res = validateApiAccess(req);
      expect(res.authorized).toBe(false);
      expect(res.response!.status).toBe(401);
    });

    it("authorizes when valid Bearer credential is provided", () => {
      process.env.DASHBOARD_ADMIN_PASSWORD = "production-admin-password";

      const req = new Request("http://localhost:3000/api/channels", {
        headers: { authorization: "Bearer production-admin-password" },
      });

      const res = validateApiAccess(req);
      expect(res.authorized).toBe(true);
      expect(res.response).toBeUndefined();
    });

    it("authorizes when valid x-admin-password credential is provided", () => {
      process.env.DASHBOARD_ADMIN_PASSWORD = "production-admin-password";

      const req = new Request("http://localhost:3000/api/channels", {
        headers: { "x-admin-password": "production-admin-password" },
      });

      const res = validateApiAccess(req);
      expect(res.authorized).toBe(true);
      expect(res.response).toBeUndefined();
    });
  });
});
