"use client";

interface DeptData {
  dept: string;
  count: number;
  enrolled: number;
  capacity: number;
}

export default function DeptStats({ sections }: { sections: any[] }) {
  const deptMap = new Map<string, DeptData>();
  for (const section of sections ?? []) {
    const dept = (section.courseCode ?? section.course?.code ?? "??").slice(0, 2);
    const current = deptMap.get(dept) ?? { dept, count: 0, enrolled: 0, capacity: 0 };
    current.count += 1;
    current.enrolled += section.enrolledCount ?? section.enrollments?.filter((item: any) => item.status === "ENROLLED").length ?? 0;
    current.capacity += section.capacity ?? 0;
    deptMap.set(dept, current);
  }

  const depts = [...deptMap.values()].sort((a, b) => b.enrolled - a.enrolled);
  if (!depts.length) return null;

  return (
    <div className="campus-card overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-700">Enrollment by Department</p>
      </div>
      <div className="divide-y divide-slate-50">
        {depts.map((dept) => (
          <div key={dept.dept} className="flex items-center gap-4 px-4 py-3">
            <span className="w-12 font-mono text-sm font-bold text-slate-700">{dept.dept}</span>
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span>{dept.enrolled} enrolled / {dept.capacity} capacity</span>
                <span className="font-semibold">{dept.capacity > 0 ? Math.round((dept.enrolled / dept.capacity) * 100) : 0}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    dept.capacity > 0 && dept.enrolled / dept.capacity >= 0.9
                      ? "bg-red-400"
                      : dept.capacity > 0 && dept.enrolled / dept.capacity >= 0.7
                        ? "bg-amber-400"
                        : "bg-blue-400"
                  }`}
                  style={{ width: `${dept.capacity > 0 ? Math.min((dept.enrolled / dept.capacity) * 100, 100) : 0}%` }}
                />
              </div>
            </div>
            <span className="w-16 text-right text-xs text-slate-400">{dept.count} section{dept.count !== 1 ? "s" : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
