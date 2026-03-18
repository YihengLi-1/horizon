"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { API_URL } from "@/lib/config";

export function LogoutButton({
  compact = false,
  iconOnly = false,
  className = ""
}: {
  compact?: boolean;
  iconOnly?: boolean;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  const onLogout = async () => {
    if (loading) return;
    setLoading(true);

    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
      window.localStorage.removeItem("sis_session_exp");
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70 ${
        iconOnly ? "size-9 px-0" : compact ? "h-9 px-2.5" : "h-9 px-3"
      } ${className}`}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" /> : null}
      {!loading ? <LogOut className="size-4" /> : null}
      {iconOnly ? null : loading ? "退出中…" : "退出登录"}
    </button>
  );
}
