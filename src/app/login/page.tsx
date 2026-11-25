"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogoIcon, LockIcon, AlertCircleIcon, EyeIcon, EyeOffIcon } from "@/components/ui/icons";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      router.refresh();
      router.replace("/");
    } catch {
      setErrorMessage("Network error occurred. Please verify your connection.");
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(37,99,235,0.12),transparent),radial-gradient(ellipse_60%_40%_at_80%_100%,rgba(79,70,229,0.08),transparent)] p-4">
      <div className="w-full max-w-sm">
        <div className="relative bg-white/95 backdrop-blur-xl border border-[#E5E7EB] rounded-3xl p-8 shadow-[0_20px_50px_-12px_rgba(37,99,235,0.16)] animate-fade-up">
          {/* Header */}
          <div className="text-center mb-7">
            <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-[#1D4ED8] to-[#3B82F6] text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] mb-3">
              <LogoIcon className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#111827]">
              Metrik
            </h1>
          </div>

          {/* Error Notice */}
          {errorMessage && (
            <div className="mb-5 flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs leading-relaxed">
              <AlertCircleIcon className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="line-clamp-2">{errorMessage}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-semibold text-[#374151] mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isLoading}
                  className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-[#D1D5DB] bg-white text-sm text-[#111827] placeholder-[#9CA3AF] shadow-xs focus:outline-hidden focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25 transition-all disabled:opacity-50"
                />
                <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#667085]" />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-[#667085] hover:text-[#111827] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOffIcon className="w-4 h-4" />
                  ) : (
                    <EyeIcon className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#4F46E5] hover:from-[#1D4ED8] hover:to-[#4338CA] active:scale-[0.99] text-white font-semibold text-sm shadow-[0_4px_14px_rgba(37,99,235,0.3)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.38)] transition-all duration-200 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <span>Verify</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
