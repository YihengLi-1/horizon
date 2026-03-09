"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Session {
  id: string;
  userId: string;
  email: string;
  loginAt: string;
  ip?: string;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError("");
      setSessions(await apiFetch<Session[]>("/auth/sessions"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load active sessions");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(id: string) {
    setRevoking(id);
    try {
      await apiFetch(`/auth/sessions/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Active Sessions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage currently tracked user sessions. This list is operational and resets when the API process restarts.
        </p>
      </div>
      {error ? (
        <div className="campus-card border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Unable to load active sessions. {error}
        </div>
      ) : null}
      <div className="campus-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading active sessions…</div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            No active sessions are currently tracked.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">Email</th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">Login Time</th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">Session ID</th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">IP</th>
                <th scope="col" className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-t border-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-700">{session.email}</td>
                  <td className="px-4 py-2 text-slate-500">{new Date(session.loginAt).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">{session.id.slice(0, 8)}…</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{session.ip ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      disabled={revoking === session.id}
                      onClick={() => void revoke(session.id)}
                      className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      {revoking === session.id ? "Revoking…" : "Revoke"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
