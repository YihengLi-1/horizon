"use client";

type HistoryItem = {
  id: string;
  status: string;
  finalGrade?: string | null;
  section?: {
    credits?: number;
    course?: {
      code?: string;
      title?: string;
    };
  };
};

const GRADE_POINTS: Record<string, number> = {
  "A+": 4,
  A: 4,
  "A-": 3.7,
  "B+": 3.3,
  B: 3,
  "B-": 2.7,
  "C+": 2.3,
  C: 2,
  "C-": 1.7,
  "D+": 1.3,
  D: 1,
  "D-": 0.7,
  F: 0
};

function calcGpa(items: HistoryItem[]): string {
  let weighted = 0;
  let credits = 0;
  for (const item of items) {
    if (!item.finalGrade) continue;
    const points = GRADE_POINTS[item.finalGrade];
    if (points === undefined) continue;
    const itemCredits = item.section?.credits ?? 0;
    weighted += points * itemCredits;
    credits += itemCredits;
  }
  return credits > 0 ? (weighted / credits).toFixed(3) : "—";
}

export default function TermReportButton({
  studentName,
  termName,
  items
}: {
  studentName: string;
  termName: string;
  items: HistoryItem[];
}) {
  const onClick = () => {
    const termGpa = calcGpa(items);
    const rows = items
      .map(
        (item) => `
          <tr>
            <td>${item.section?.course?.code ?? "—"}</td>
            <td>${item.section?.course?.title ?? "—"}</td>
            <td>${item.section?.credits ?? 0}</td>
            <td>${item.finalGrade ?? item.status}</td>
          </tr>
        `
      )
      .join("");
    const html = `<!DOCTYPE html>
      <html>
        <head>
          <title>${termName} Grade Report</title>
          <style>
            body { font-family: Georgia, serif; margin: 32px auto; max-width: 820px; padding: 24px; color: #0f172a; }
            h1, h2 { text-align: center; margin: 0; }
            p.meta { text-align: center; color: #64748b; margin: 8px 0 24px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
            th { background: #f8fafc; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em; }
            .summary { margin-top: 20px; display: flex; justify-content: space-between; font-weight: 600; }
          </style>
        </head>
        <body>
          <h1>地平线 SIS</h1>
          <h2>${termName} Grade Report</h2>
          <p class="meta">${studentName}</p>
          <table>
            <thead>
              <tr><th>Course</th><th>Title</th><th>Credits</th><th>Grade / Status</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="summary">
            <span>Term GPA: ${termGpa}</span>
            <span>Generated: ${new Date().toLocaleDateString()}</span>
          </div>
        </body>
      </html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.print();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-semibold text-blue-600 hover:underline"
    >
      下载成绩单
    </button>
  );
}
