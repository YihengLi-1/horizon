"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";

type FacultyProfile = {
  displayName: string;
  employeeId?: string | null;
  department?: string | null;
  title?: string | null;
};

type AdvisorProfile = {
  displayName: string;
  employeeId?: string | null;
  department?: string | null;
  officeLocation?: string | null;
};

type Faculty = {
  id: string;
  email: string;
  createdAt: string;
  facultyProfile?: FacultyProfile | null;
  _count?: { instructedSections: number };
};

type Advisor = {
  id: string;
  email: string;
  createdAt: string;
  advisorProfile?: AdvisorProfile | null;
  advisorAssignments?: { id: string }[];
};

type Student = {
  id: string;
  email: string;
  studentId?: string | null;
  studentProfile?: { legalName?: string | null; programMajor?: string | null } | null;
};

type Tab = "faculty" | "advisors" | "assign";

const BLANK_FACULTY = { email: "", password: "", displayName: "", employeeId: "", department: "", title: "" };
const BLANK_ADVISOR = { email: "", password: "", displayName: "", employeeId: "", department: "", officeLocation: "" };

export default function StaffPage() {
  const [tab, setTab] = useState<Tab>("faculty");
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Create faculty form
  const [showFacultyForm, setShowFacultyForm] = useState(false);
  const [facultyForm, setFacultyForm] = useState(BLANK_FACULTY);
  const [creatingFaculty, setCreatingFaculty] = useState(false);

  // Create advisor form
  const [showAdvisorForm, setShowAdvisorForm] = useState(false);
  const [advisorForm, setAdvisorForm] = useState(BLANK_ADVISOR);
  const [creatingAdvisor, setCreatingAdvisor] = useState(false);

  // Advisor assignment
  const [assignStudentId, setAssignStudentId] = useState("");
  const [assignAdvisorId, setAssignAdvisorId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<string>("");

  const toast = useToast();

  const loadFaculty = async () => {
    const d = await apiFetch<Faculty[]>("/admin/faculty");
    setFaculty(d ?? []);
  };

  const loadAdvisors = async () => {
    const d = await apiFetch<Advisor[]>("/admin/advisors");
    setAdvisors(d ?? []);
  };

  const loadStudents = async () => {
    const d = await apiFetch<{ items?: Student[]; data?: Student[] } | Student[]>("/admin/students");
    const list = Array.isArray(d) ? d : ((d as { items?: Student[] }).items ?? (d as { data?: Student[] }).data ?? []);
    setStudents(list);
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadFaculty(), loadAdvisors(), loadStudents()])
      .catch((err) => toast(err instanceof Error ? err.message : "数据加载失败", "error"))
      .finally(() => setLoading(false));
  }, []);

  // Keyboard shortcut [/] to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const onCreateFaculty = async (e: FormEvent) => {
    e.preventDefault();
    setCreatingFaculty(true);
    try {
      await apiFetch("/admin/faculty", {
        method: "POST",
        body: JSON.stringify({
          email: facultyForm.email.trim(),
          password: facultyForm.password,
          displayName: facultyForm.displayName.trim(),
          employeeId: facultyForm.employeeId.trim() || null,
          department: facultyForm.department.trim() || null,
          title: facultyForm.title.trim() || null,
        }),
      });
      toast("教职人员账号已创建", "success");
      setFacultyForm(BLANK_FACULTY);
      setShowFacultyForm(false);
      await loadFaculty();
    } catch (err) {
      toast(err instanceof Error ? err.message : "创建失败", "error");
    } finally {
      setCreatingFaculty(false);
    }
  };

  const onCreateAdvisor = async (e: FormEvent) => {
    e.preventDefault();
    setCreatingAdvisor(true);
    try {
      await apiFetch("/admin/advisors", {
        method: "POST",
        body: JSON.stringify({
          email: advisorForm.email.trim(),
          password: advisorForm.password,
          displayName: advisorForm.displayName.trim(),
          employeeId: advisorForm.employeeId.trim() || null,
          department: advisorForm.department.trim() || null,
          officeLocation: advisorForm.officeLocation.trim() || null,
        }),
      });
      toast("导师账号已创建", "success");
      setAdvisorForm(BLANK_ADVISOR);
      setShowAdvisorForm(false);
      await loadAdvisors();
    } catch (err) {
      toast(err instanceof Error ? err.message : "创建失败", "error");
    } finally {
      setCreatingAdvisor(false);
    }
  };

  const onAssign = async (e: FormEvent) => {
    e.preventDefault();
    if (!assignStudentId || !assignAdvisorId) return;
    setAssigning(true);
    setAssignResult("");
    try {
      await apiFetch("/admin/advisor-assignments", {
        method: "POST",
        body: JSON.stringify({
          studentId: assignStudentId,
          advisorId: assignAdvisorId,
          notes: assignNotes.trim() || null,
        }),
      });
      const student = students.find((s) => s.id === assignStudentId);
      const advisor = advisors.find((a) => a.id === assignAdvisorId);
      const sName = student?.studentProfile?.legalName ?? student?.email ?? assignStudentId;
      const aName = advisor?.advisorProfile?.displayName ?? advisor?.email ?? assignAdvisorId;
      setAssignResult(`已将学生「${sName}」分配给导师「${aName}」。`);
      toast("导师分配成功", "success");
      setAssignStudentId("");
      setAssignAdvisorId("");
      setAssignNotes("");
      await loadAdvisors();
    } catch (err) {
      toast(err instanceof Error ? err.message : "分配失败", "error");
    } finally {
      setAssigning(false);
    }
  };

  const filteredFaculty = faculty.filter((f) => {
    const q = search.toLowerCase();
    return (
      f.email.toLowerCase().includes(q) ||
      (f.facultyProfile?.displayName ?? "").toLowerCase().includes(q) ||
      (f.facultyProfile?.department ?? "").toLowerCase().includes(q) ||
      (f.facultyProfile?.employeeId ?? "").toLowerCase().includes(q)
    );
  });

  const filteredAdvisors = advisors.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.email.toLowerCase().includes(q) ||
      (a.advisorProfile?.displayName ?? "").toLowerCase().includes(q) ||
      (a.advisorProfile?.department ?? "").toLowerCase().includes(q)
    );
  });

  const TAB_LABELS: Record<Tab, string> = { faculty: "教职人员", advisors: "导师", assign: "导师分配" };

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">人员管理</p>
        <h1 className="campus-title">教职与导师管理</h1>
        <p className="campus-subtitle">管理教职人员、学术导师账号，以及学生导师分配关系。</p>
      </section>

      {/* KPI Strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-value">{faculty.length}</p>
          <p className="campus-kpi-label">教职人员</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-value">{advisors.length}</p>
          <p className="campus-kpi-label">导师</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-value">
            {advisors.reduce((sum, a) => sum + (a.advisorAssignments?.length ?? 0), 0)}
          </p>
          <p className="campus-kpi-label">当前分配数</p>
        </div>
      </section>

      {/* Tab Bar */}
      <div className="flex border-b border-slate-200">
        {(["faculty", "advisors", "assign"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setSearch(""); }}
            className={`px-5 py-2.5 text-sm font-medium transition-colors ${
              tab === t
                ? "border-b-2 border-primary text-primary"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab !== "assign" ? (
        <section className="campus-toolbar gap-3">
          <input
            ref={searchRef}
            className="campus-input w-64"
            placeholder="搜索姓名、邮箱、部门…  [/]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={tab === "faculty" ? "搜索教职人员" : "搜索导师"}
          />
          <button
            type="button"
            onClick={() => tab === "faculty" ? setShowFacultyForm((v) => !v) : setShowAdvisorForm((v) => !v)}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90"
          >
            + 新建{tab === "faculty" ? "教职人员" : "导师"}
          </button>
        </section>
      ) : null}

      {/* Faculty Tab */}
      {tab === "faculty" ? (
        <>
          {showFacultyForm ? (
            <section className="campus-card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-700">新建教职人员账号</h2>
              <form onSubmit={(e) => void onCreateFaculty(e)} className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">邮箱 *</label>
                  <input className="campus-input" type="email" required value={facultyForm.email} onChange={(e) => setFacultyForm((p) => ({ ...p, email: e.target.value }))} placeholder="faculty@university.edu" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">初始密码 *</label>
                  <input className="campus-input" type="password" required minLength={8} value={facultyForm.password} onChange={(e) => setFacultyForm((p) => ({ ...p, password: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">姓名 *</label>
                  <input className="campus-input" required value={facultyForm.displayName} onChange={(e) => setFacultyForm((p) => ({ ...p, displayName: e.target.value }))} placeholder="张三" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">工号</label>
                  <input className="campus-input" value={facultyForm.employeeId} onChange={(e) => setFacultyForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="F2024001" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">院系</label>
                  <input className="campus-input" value={facultyForm.department} onChange={(e) => setFacultyForm((p) => ({ ...p, department: e.target.value }))} placeholder="计算机学院" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">职称</label>
                  <input className="campus-input" value={facultyForm.title} onChange={(e) => setFacultyForm((p) => ({ ...p, title: e.target.value }))} placeholder="副教授" />
                </div>
                <div className="md:col-span-3 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowFacultyForm(false)} className="campus-btn-ghost">取消</button>
                  <button type="submit" disabled={creatingFaculty} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-white disabled:opacity-60">
                    {creatingFaculty ? "创建中…" : "创建账号"}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="campus-card overflow-hidden">
            {loading ? (
              <div className="p-6 text-sm text-slate-500">加载中…</div>
            ) : filteredFaculty.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">暂无教职人员数据。</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="campus-table min-w-[640px]">
                  <thead>
                    <tr>
                      <th scope="col">姓名</th>
                      <th scope="col">邮箱</th>
                      <th scope="col">工号</th>
                      <th scope="col">院系</th>
                      <th scope="col">职称</th>
                      <th scope="col">授课班级数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFaculty.map((f) => (
                      <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {f.facultyProfile?.displayName ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{f.email}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {f.facultyProfile?.employeeId ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {f.facultyProfile?.department ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {f.facultyProfile?.title ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="campus-chip chip-blue text-xs">
                            {f._count?.instructedSections ?? 0}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {/* Advisors Tab */}
      {tab === "advisors" ? (
        <>
          {showAdvisorForm ? (
            <section className="campus-card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-700">新建导师账号</h2>
              <form onSubmit={(e) => void onCreateAdvisor(e)} className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">邮箱 *</label>
                  <input className="campus-input" type="email" required value={advisorForm.email} onChange={(e) => setAdvisorForm((p) => ({ ...p, email: e.target.value }))} placeholder="advisor@university.edu" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">初始密码 *</label>
                  <input className="campus-input" type="password" required minLength={8} value={advisorForm.password} onChange={(e) => setAdvisorForm((p) => ({ ...p, password: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">姓名 *</label>
                  <input className="campus-input" required value={advisorForm.displayName} onChange={(e) => setAdvisorForm((p) => ({ ...p, displayName: e.target.value }))} placeholder="李老师" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">工号</label>
                  <input className="campus-input" value={advisorForm.employeeId} onChange={(e) => setAdvisorForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="A2024001" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">院系</label>
                  <input className="campus-input" value={advisorForm.department} onChange={(e) => setAdvisorForm((p) => ({ ...p, department: e.target.value }))} placeholder="学生服务处" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">办公室位置</label>
                  <input className="campus-input" value={advisorForm.officeLocation} onChange={(e) => setAdvisorForm((p) => ({ ...p, officeLocation: e.target.value }))} placeholder="行政楼 302" />
                </div>
                <div className="md:col-span-3 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowAdvisorForm(false)} className="campus-btn-ghost">取消</button>
                  <button type="submit" disabled={creatingAdvisor} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-white disabled:opacity-60">
                    {creatingAdvisor ? "创建中…" : "创建账号"}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="campus-card overflow-hidden">
            {loading ? (
              <div className="p-6 text-sm text-slate-500">加载中…</div>
            ) : filteredAdvisors.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">暂无导师数据。</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="campus-table min-w-[560px]">
                  <thead>
                    <tr>
                      <th scope="col">姓名</th>
                      <th scope="col">邮箱</th>
                      <th scope="col">工号</th>
                      <th scope="col">院系</th>
                      <th scope="col">办公室</th>
                      <th scope="col">当前学生数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdvisors.map((a) => (
                      <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {a.advisorProfile?.displayName ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{a.email}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {a.advisorProfile?.employeeId ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {a.advisorProfile?.department ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {a.advisorProfile?.officeLocation ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`campus-chip text-xs ${
                            (a.advisorAssignments?.length ?? 0) > 20 ? "chip-amber" : "chip-emerald"
                          }`}>
                            {a.advisorAssignments?.length ?? 0}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {/* Advisor Assignment Tab */}
      {tab === "assign" ? (
        <section className="space-y-4 max-w-xl">
          <div className="campus-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">为学生分配导师</h2>
            <p className="text-xs text-slate-500">分配后将自动结束该学生的上一个有效导师关系。</p>
            <form onSubmit={(e) => void onAssign(e)} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">
                  选择学生
                </label>
                <select
                  className="campus-select"
                  value={assignStudentId}
                  onChange={(e) => setAssignStudentId(e.target.value)}
                  required
                >
                  <option value="">— 请选择学生 —</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.studentProfile?.legalName
                        ? `${s.studentProfile.legalName}（${s.studentId ?? s.email}）`
                        : s.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">
                  选择导师
                </label>
                <select
                  className="campus-select"
                  value={assignAdvisorId}
                  onChange={(e) => setAssignAdvisorId(e.target.value)}
                  required
                >
                  <option value="">— 请选择导师 —</option>
                  {advisors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.advisorProfile?.displayName
                        ? `${a.advisorProfile.displayName}（${a.advisorProfile.department ?? a.email}）`
                        : a.email}
                      {" "}· 当前 {a.advisorAssignments?.length ?? 0} 名学生
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">
                  分配备注（可选）
                </label>
                <textarea
                  className="campus-input min-h-[80px]"
                  placeholder="例：因特殊需求调整导师…"
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={assigning || !assignStudentId || !assignAdvisorId}
                className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {assigning ? "分配中…" : "确认分配"}
              </button>
            </form>
          </div>

          {assignResult ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {assignResult}
            </div>
          ) : null}

          {/* Advisor load summary */}
          {advisors.length > 0 ? (
            <div className="campus-card p-4 space-y-2">
              <p className="text-xs font-semibold uppercase text-slate-400">导师负荷概览</p>
              <div className="space-y-1.5">
                {[...advisors]
                  .sort((a, b) => (b.advisorAssignments?.length ?? 0) - (a.advisorAssignments?.length ?? 0))
                  .map((a) => {
                    const count = a.advisorAssignments?.length ?? 0;
                    const pct = Math.min(100, (count / 30) * 100);
                    return (
                      <div key={a.id} className="flex items-center gap-2 text-xs">
                        <span className="w-32 truncate text-slate-700">
                          {a.advisorProfile?.displayName ?? a.email}
                        </span>
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${count > 25 ? "bg-red-400" : count > 15 ? "bg-amber-400" : "bg-emerald-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-slate-500">{count}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
