"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogoIcon, LockIcon, AlertCircleIcon } from "@/components/ui/icons";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if session is already active
  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => {
        if (res.ok) {
          router.replace("/");
        }
      })
      .catch(() => {
        // Not logged in or network error, stay on login page
      });
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMessage("Please enter the administration password.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 503) {
          setErrorMessage(
            data.error?.message ||
              "DASHBOARD_ADMIN_PASSWORD is not configured on this server. Configure an admin password to enable API access."
          );
        } else {
          setErrorMessage(data.error?.message || "Invalid administration password.");
        }
        setIsLoading(false);
        return;
      }

      // Login succeeded, cookie is set automatically by server
      router.replace("/");
    } catch {
      setErrorMessage("Network error occurred. Please verify your connection.");
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
          {/* Header */}
          <div className="text-center mb-7">
            <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-md mb-3.5">
              <LogoIcon className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
              Metrik Dashboard
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
              Self-hosted Telegram channel analytics
            </p>
          </div>

          {/* Error Notice */}
          {errorMessage && (
            <div className="mb-5 flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs leading-relaxed">
              <AlertCircleIcon className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="line-clamp-2">{errorMessage}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5"
              >
                Administration Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter DASHBOARD_ADMIN_PASSWORD"
                  disabled={isLoading}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-800/60 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 shadow-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-50"
                />
                <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-sm shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 hover:shadow-md"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <span>Sign In to Dashboard</span>
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800 text-center">
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 line-clamp-2">
              Metrik requires an administrative password configured on the host server.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
