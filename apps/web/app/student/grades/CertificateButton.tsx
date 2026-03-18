"use client";

type CompletedCourse = {
  code: string;
  title: string;
  credits: number;
  grade: string;
};

type Props = {
  studentName: string;
  completedCourses: CompletedCourse[];
};

export default function CertificateButton({ studentName, completedCourses }: Props) {
  function printCert() {
    const html = `<!DOCTYPE html><html><head><title>学业证书</title>
<style>
  body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 40px; }
  .border { border: 8px double #1e293b; padding: 40px; }
  h1 { text-align: center; font-size: 28pt; color: #1e293b; }
  .subtitle { text-align: center; color: #64748b; margin-bottom: 32px; }
  .name { text-align: center; font-size: 24pt; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f1f5f9; text-align: left; padding: 8px 12px; font-size: 10pt; text-transform: uppercase; letter-spacing: 1px; }
  td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
  .footer { text-align: center; margin-top: 40px; color: #94a3b8; font-size: 10pt; }
  @media print { @page { margin: 1cm; } }
</style></head><body>
<div class="border">
  <h1>地平线 SIS</h1>
  <p class="subtitle">学业成绩证明</p>
  <p class="name">${studentName}</p>
  <table>
    <thead><tr><th>课程代码</th><th>课程名称</th><th>学分</th><th>成绩</th></tr></thead>
    <tbody>${completedCourses
      .map(
        (course) =>
          `<tr><td>${course.code}</td><td>${course.title}</td><td>${course.credits}</td><td><strong>${course.grade}</strong></td></tr>`
      )
      .join("")}</tbody>
  </table>
  <p class="footer">生成于 ${new Date().toLocaleDateString()} · 地平线大学教务管理系统</p>
</div></body></html>`;
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.write(html);
    popup.document.close();
    popup.print();
  }

  if (!completedCourses.length) return null;

  return (
    <button
      type="button"
      onClick={printCert}
      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-100"
    >
      🎓 打印证书
    </button>
  );
}
