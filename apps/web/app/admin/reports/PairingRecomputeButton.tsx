"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

export default function PairingRecomputeButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ upserted: number } | null>(null);
  const [error, setError] = useState("");

  async function recompute() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await apiFetch<{ upserted: number }>("/academics/pairings/recompute", { method: "POST" });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => void recompute()}
        disabled={loading}
        className="campus-chip cursor-pointer border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
      >
        {loading ? "Computing…" : "🔗 Recompute Course Pairings"}
      </button>
      {result ? <span className="text-xs text-emerald-600">✓ {result.upserted} pairs updated</span> : null}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
