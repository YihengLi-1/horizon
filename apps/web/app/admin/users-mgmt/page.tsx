"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";

type UserRow = {
  id: string;
  email: string;
  studentId: string | null;
  role: string;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  loginAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
};

const ROLE_LABELS: Record<string, string> = {
  STUDENT: "学生",
  ADMIN: "管理员",
  FACULTY: "教师",
  ADVISOR: "顾问",
};

const ROLE_COLORS: Record<string, string> = {
  STUDENT: "bg-blue-50 text-blue-700 border-blue-200",
  ADMIN: "bg-red-50 text-red-700 border-red-200",
  FACULTY: "bg-purple-50 text-purple-700 border-purple-200",
  ADVISOR: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function UsersMgmtPage() {
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const LIMIT = 20;

  const load = useCallback(async (p: number, s: string, r: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (s) params.set("search", s);
      if (r) params.set("role", r);
      const data = await apiFetch<{ total: number; users: UserRow[] }>(`/admin/users?${params}`);
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      toast(err instanceof Error ? err.message : "加载失败", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(page, search, roleFilter); }, [load, page, search, roleFilter]);

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPage(1);
    void load(1, search, roleFilter);
  }

  async function toggleLock(user: UserRow) {
    const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
    setWorking(user.id);
    try {
      await apiFetch(`/admin/users/${user.id}/lock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lock: !isLocked }),
      });
      toast(isLocked ? `已解锁 ${user.email}` : `已锁定 ${user.email}`, "success");
      void load(page, search, roleFilter);
    } catch (err) {
      toast(err instanceof Error ? err.message : "操作失败", "error");
    } finally {
      setWorking(null);
    }
  }

  async function changeRole(user: UserRow, newRole: string) {
    setWorking(user.id);
    try {
      await apiFetch(`/admin/users/${user.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      toast(`已将 ${user.email} 角色改为 ${ROLE_LABELS[newRole] ?? newRole}`, "success");
      void load(page, search, roleFilter);
    } catch (err) {
      toast(err instanceof Error ? err.message : "操作失败", "error");
    } finally {
      setWorking(null);
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <p className="campus-eyebrow">系统管理</p>
        <h1 className="campus-title">用户管理</h1>
        <p className="campus-subtitle">查看、锁定账号、变更用户角色</p>
      </div>

      {/* Toolbar */}
      <form onSubmit={handleSearch} className="campus-toolbar flex-wrap gap-2">
        <input
          className="campus-input flex-1 min-w-48"
          placeholder="搜索邮箱或学号…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="campus-select"
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
        >
          <option value="">全部角色</option>
          <option value="STUDENT">学生</option>
          <option value="ADMIN">管理员</option>
          <option value="FACULTY">教师</option>
          <option value="ADVISOR">顾问</option>
        </select>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          搜索
        </button>
        <span className="ml-auto text-sm text-slate-500">共 {total} 名用户</span>
      </form>

      {/* Table */}
      <div className="campus-card overflow-hidden p-0">
        {loading ? (
          <div className="p-10 text-center text-slate-400">加载中…</div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-slate-400">暂无符合条件的用户。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-4 py-3 font-medium">邮箱</th>
                  <th className="px-4 py-3 font-medium">学号</th>
                  <th className="px-4 py-3 font-medium">角色</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">最后登录</th>
                  <th className="px-4 py-3 font-medium">注册时间</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((u) => {
                  const isLocked = !!u.lockedUntil && new Date(u.lockedUntil) > new Date();
                  return (
                    <tr key={u.id} className={`hover:bg-slate-50/50 ${isLocked ? "opacity-60" : ""}`}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-slate-700">{u.email}</span>
                        {!u.emailVerifiedAt && (
                          <span className="ml-2 text-xs text-amber-600">未验证</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{u.studentId ?? "—"}</td>
                      <td className="px-4 py-3">
                        <select
                          className={`rounded border px-1.5 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role] ?? "bg-slate-50 text-slate-700 border-slate-200"}`}
                          value={u.role}
                          disabled={working === u.id}
                          onChange={(e) => void changeRole(u, e.target.value)}
                        >
                          <option value="STUDENT">学生</option>
                          <option value="ADMIN">管理员</option>
                          <option value="FACULTY">教师</option>
                          <option value="ADVISOR">顾问</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {isLocked ? (
                          <span className="campus-chip border-red-200 bg-red-50 text-red-700 text-xs">已锁定</span>
                        ) : (
                          <span className="campus-chip border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">正常</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("zh-CN") : "从未登录"}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={working === u.id}
                          onClick={() => void toggleLock(u)}
                          className={`rounded px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                            isLocked
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                              : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                          }`}
                        >
                          {working === u.id ? "处理中…" : isLocked ? "解锁" : "锁定"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-slate-50"
          >
            上一页
          </button>
          <span className="text-sm text-slate-500">{page} / {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-slate-50"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
