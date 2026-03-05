"use client";

import { useState } from "react";

const CLIENT_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const onLogout = async () => {
    if (loading) return;
    setLoading(true);

    try {
      await fetch(`${CLIENT_API_URL}/auth/logout`, {
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
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" /> : null}
      {loading ? "Logging out..." : "Logout"}
    </button>
  );
}
