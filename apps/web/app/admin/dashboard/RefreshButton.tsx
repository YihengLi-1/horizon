"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

export default function RefreshButton() {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);

  function refresh() {
    setSpinning(true);
    router.refresh();
    window.setTimeout(() => setSpinning(false), 800);
  }

  return (
    <button
      type="button"
      onClick={refresh}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
      aria-label="刷新仪表盘"
    >
      <RefreshCw className={`h-4 w-4 text-slate-500 transition-transform ${spinning ? "animate-spin" : ""}`} />
    </button>
  );
}
