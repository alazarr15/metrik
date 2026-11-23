import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST as loginRoute } from "../src/app/api/auth/login/route.ts";
import { POST as logoutRoute } from "../src/app/api/auth/logout/route.ts";
import { GET as sessionRoute } from "../src/app/api/auth/session/route.ts";
import { GET as getChannels } from "../src/app/api/channels/route.ts";
import { createSessionToken, SESSION_COOKIE_NAME } from "../src/server/auth/session.ts";

describe("Authentication & Session API Endpoints", () => {
  const TEST_PASSWORD = "test-dashboard-admin-password";
  const originalEnv = process.env.DASHBOARD_ADMIN_PASSWORD;

  beforeAll(() => {
    process.env.DASHBOARD_ADMIN_PASSWORD = TEST_PASSWORD;
  });

  afterAll(() => {
    if (originalEnv !== undefined) {
      process.env.DASHBOARD_ADMIN_PASSWORD = originalEnv;
    } else {
      delete process.env.DASHBOARD_ADMIN_PASSWORD;
    }
  });

  describe("POST /api/auth/login", () => {
    it("returns 503 SERVER_MISCONFIGURED when DASHBOARD_ADMIN_PASSWORD is unset", async () => {
      delete process.env.DASHBOARD_ADMIN_PASSWORD;

      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ password: "any" }),
      });

      const res = await loginRoute(req);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error.code).toBe("SERVER_MISCONFIGURED");

      process.env.DASHBOARD_ADMIN_PASSWORD = TEST_PASSWORD;
    });

    it("rejects cross-origin login attempts with 403 FORBIDDEN", async () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          host: "localhost:3000",
          origin: "http://attacker.com",
        },
        body: JSON.stringify({ password: TEST_PASSWORD }),
      });

      const res = await loginRoute(req);
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
        body: "not-json",
      });

      const res = await loginRoute(req);
      expect(res.status).toBe(400);
    });

    it("returns 401 for wrong password", async () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ password: "wrong-password" }),
      });

      const res = await loginRoute(req);
      expect(res.status).toBe(401);
    });

    it("returns 200 and sets HTTP-only session cookie for correct password", async () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ password: TEST_PASSWORD }),
      });

      const res = await loginRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);

      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain(SESSION_COOKIE_NAME);
      expect(setCookie?.toLowerCase()).toContain("httponly");
      expect(setCookie?.toLowerCase()).toContain("samesite=strict");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("returns 200 and clears the session cookie", async () => {
      const res = await logoutRoute();
      expect(res.status).toBe(200);

      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain(SESSION_COOKIE_NAME);
      expect(setCookie).toContain("Max-Age=0");
    });
  });

  describe("GET /api/auth/session & Cookie Guard Integration", () => {
    it("returns 401 for unauthenticated session check", async () => {
      const req = new Request("http://localhost:3000/api/auth/session");
      const res = await sessionRoute(req);
      expect(res.status).toBe(401);
    });

    it("returns 200 for session check with valid session cookie", async () => {
      const validToken = createSessionToken();
      const req = new Request("http://localhost:3000/api/auth/session", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
        },
      });

      const res = await sessionRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
    });

    it("authorizes analytics API route access via valid session cookie", async () => {
      const validToken = createSessionToken();
      const req = new Request("http://localhost:3000/api/channels", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
        },
      });

      const res = await getChannels(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("channels");
    });

    it("rejects analytics API route access when session cookie has tampered signature", async () => {
      const validToken = createSessionToken();
      const tampered = validToken + "corrupted";
      const req = new Request("http://localhost:3000/api/channels", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${tampered}`,
        },
      });

      const res = await getChannels(req);
      expect(res.status).toBe(401);
    });
  });
});
