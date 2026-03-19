"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";

type TabKey = "students" | "courses" | "sections";

type ImportResult = {
  created: number;
  updated: number;
  failed: number;
  errors?: Array<{ row: number; message: string }>;
};

const TEMPLATES: Record<TabKey, { filename: string; headers: string[]; example: string[] }> = {
  students: {
    filename: "students-template.csv",
    headers: ["email", "studentId", "legalName", "password"],
    example: ["zhang.san@uni.edu", "2024001", "张三", "Pass@1234"],
  },
  courses: {
    filename: "courses-template.csv",
    headers: ["code", "title", "credits", "description"],
    example: ["CS101", "计算机导论", "3", "面向全体学生的计算机科学入门课程"],
  },
  sections: {
    filename: "sections-template.csv",
    headers: [
      "termName", "courseCode", "sectionCode", "modality", "capacity",
      "credits", "instructorName", "location", "requireApproval", "meetings",
    ],
    example: [
      "2024春季", "CS101", "CS101-001", "IN_PERSON", "30",
      "3", "李教授", "教学楼A-101", "false", "MWF 09:00-09:50",
    ],
  },
};

const ENDPOINT: Record<TabKey, string> = {
  students: "/admin/import/students",
  courses: "/admin/import/courses",
  sections: "/admin/import/sections",
};

const TAB_LABELS: Record<TabKey, string> = {
  students: "学生导入",
  courses: "课程导入",
  sections: "教学班导入",
};

const TAB_DESC: Record<TabKey, string> = {
  students: "批量创建或更新学生账号及档案。以 email 为唯一键，已存在时更新字段。",
  courses: "批量创建或更新课程目录。以课程代码（code）为唯一键，已存在时更新标题、学分等。",
  sections: "批量创建教学班。termName + courseCode + sectionCode 三者组合唯一。",
};

function downloadTemplate(tab: TabKey) {
  const { filename, headers, example } = TEMPLATES[tab];
  const rows = [headers.join(","), example.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminImportPage() {
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>("students");
  const [csvText, setCsvText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const tabs: TabKey[] = ["students", "courses", "sections"];

  function handleTabChange(t: TabKey) {
    setTab(t);
    setCsvText("");
    setResult(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText((ev.target?.result as string) ?? "");
      setResult(null);
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  async function runImport() {
    if (!csvText.trim()) {
      toast("请先粘贴或上传 CSV 内容", "error");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await apiFetch<ImportResult>(ENDPOINT[tab], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      });
      setResult(data);
      toast(`导入完成：创建 ${data.created}，更新 ${data.updated}，失败 ${data.failed}`, data.failed === 0 ? "success" : "error");
    } catch (err) {
      toast(err instanceof Error ? err.message : "导入失败", "error");
    } finally {
      setLoading(false);
    }
  }

  const lineCount = csvText.trim() ? csvText.trim().split("\n").length - 1 : 0; // minus header

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">数据管理</p>
        <h1 className="campus-title">CSV 批量导入</h1>
        <p className="campus-subtitle">通过标准 CSV 文件批量创建或更新学生、课程和教学班数据</p>
      </section>

      {/* Tabs */}
      <div className="campus-card p-2">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleTabChange(t)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === t
                  ? "bg-blue-600 text-white"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Description + template */}
      <div className="campus-card px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">{TAB_LABELS[tab]}</p>
            <p className="mt-1 text-sm text-slate-500">{TAB_DESC[tab]}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TEMPLATES[tab].headers.map((h) => (
                <span
                  key={h}
                  className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-600"
                >
                  {h}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => downloadTemplate(tab)}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            下载模板
          </button>
        </div>
      </div>

      {/* Input area */}
      <div className="campus-card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">CSV 内容</p>
          <div className="flex items-center gap-2">
            {csvText.trim() && (
              <span className="campus-chip border-blue-200 bg-blue-50 text-blue-700 text-xs">
                {lineCount} 行数据
              </span>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              上传文件
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileChange}
            />
            {csvText && (
              <button
                type="button"
                onClick={() => { setCsvText(""); setResult(null); }}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                清空
              </button>
            )}
          </div>
        </div>
        <textarea
          className="h-64 w-full rounded-xl border border-slate-200 px-3 py-3 font-mono text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          placeholder={`粘贴 CSV 内容，或点击右上角「上传文件」\n第一行必须是列头，如：\n${TEMPLATES[tab].headers.join(",")}`}
          value={csvText}
          onChange={(e) => { setCsvText(e.target.value); setResult(null); }}
          spellCheck={false}
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void runImport()}
            disabled={loading || !csvText.trim()}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "导入中…" : "开始导入"}
          </button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="campus-card space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-bold text-slate-800">导入结果</p>
            <span className="campus-chip border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">
              创建 {result.created}
            </span>
            <span className="campus-chip border-blue-200 bg-blue-50 text-blue-700 text-xs">
              更新 {result.updated}
            </span>
            {result.failed > 0 && (
              <span className="campus-chip border-red-200 bg-red-50 text-red-700 text-xs">
                失败 {result.failed}
              </span>
            )}
          </div>

          {result.errors && result.errors.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                    <th className="px-4 py-2 text-left font-medium">行号</th>
                    <th className="px-4 py-2 text-left font-medium">错误信息</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {result.errors.map((e, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{e.row}</td>
                      <td className="px-4 py-2 text-xs text-red-700">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.failed === 0 && (
            <p className="text-sm text-emerald-700">✓ 全部记录导入成功，无错误。</p>
          )}
        </div>
      )}
    </div>
  );
}
