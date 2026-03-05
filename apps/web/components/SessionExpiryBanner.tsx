"use client";

import { useEffect, useState } from "react";

export default function SessionExpiryBanner() {
  const [minsLeft, setMinsLeft] = useState<number | null>(null);

  useEffect(() => {
    function check() {
      const exp = window.localStorage.getItem("sis_session_exp");
      if (!exp) {
        setMinsLeft(null);
        return;
      }
      const diff = Math.floor((Number(exp) - Date.now()) / 60000);
      setMinsLeft(diff);
    }

    check();
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (minsLeft === null || minsLeft > 10 || minsLeft <= 0) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-md"
    >
      <span>⏱ Your session expires in {minsLeft} minute{minsLeft !== 1 ? "s" : ""}.</span>
      <a
        href="/login"
        className="ml-4 rounded-md border border-white/40 px-3 py-0.5 text-xs font-semibold hover:bg-white/20"
      >
        Re-login
      </a>
    </div>
  );
}
