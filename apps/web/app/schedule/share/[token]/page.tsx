import Link from "next/link";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";

type MeetingTime = {
  id?: string;
  weekday: number;
  startMinutes: number;
  endMinutes: number;
};

type SharedSection = {
  id: string;
  sectionCode: string;
  instructorName: string;
  location: string | null;
  credits: number;
  course: {
    code: string;
    title: string;
  };
  meetingTimes: MeetingTime[];
};

type SnapshotResponse = {
  sectionsJson: string;
  createdAt: string;
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GRID_DAY_INDEXES = [1, 2, 3, 4, 5, 6, 0];
const GRID_START = 8 * 60;
const GRID_END = 21 * 60;
const GRID_SLOT = 30;

function fmt(minutes: number): string {
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

function parseSections(payload: string): SharedSection[] {
  try {
    const parsed = JSON.parse(payload);
    return Array.isArray(parsed) ? (parsed as SharedSection[]) : [];
  } catch {
    return [];
  }
}

export default async function SharedSchedulePage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  if (process.env.ENABLE_PUBLIC_SCHEDULE_SHARING !== "true") {
    return (
      <div className="campus-page flex min-h-screen items-center justify-center">
        <div className="campus-card max-w-lg p-8 text-center">
          <p className="text-4xl">🔒</p>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">课表分享已禁用</h1>
          <p className="mt-2 text-sm text-slate-600">
            Public schedule links are disabled in this deployment to reduce student privacy risk.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Ask the registrar/support team if read-only schedule export needs to be re-enabled with expiration controls.
          </p>
          <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-slate-900 underline">
            返回系统登录
          </Link>
        </div>
      </div>
    );
  }

  const { token } = await params;

  let snapshot: SnapshotResponse;
  try {
    snapshot = await serverApi<SnapshotResponse>(`/students/schedule/snapshot/${token}`);
  } catch {
    notFound();
  }

  const sections = parseSections(snapshot.sectionsJson);
  const timeSlots: number[] = [];
  for (let minutes = GRID_START; minutes < GRID_END; minutes += GRID_SLOT) {
    timeSlots.push(minutes);
  }

  const blocks = sections.flatMap((section, sectionIndex) =>
    (section.meetingTimes ?? [])
      .filter((meetingTime) => meetingTime.endMinutes > GRID_START && meetingTime.startMinutes < GRID_END)
      .map((meetingTime, meetingIndex) => {
        const startMinutes = Math.max(meetingTime.startMinutes, GRID_START);
        const endMinutes = Math.min(meetingTime.endMinutes, GRID_END);
        const rowStart = Math.floor((startMinutes - GRID_START) / GRID_SLOT) + 2;
        const rowSpan = Math.max(1, Math.ceil((endMinutes - startMinutes) / GRID_SLOT));
        const colStart = meetingTime.weekday === 0 ? 8 : meetingTime.weekday + 1;
        const palette = [
          "border-blue-500 bg-blue-100 text-blue-900",
          "border-emerald-500 bg-emerald-100 text-emerald-900",
          "border-amber-500 bg-amber-100 text-amber-900",
          "border-violet-500 bg-violet-100 text-violet-900",
          "border-rose-500 bg-rose-100 text-rose-900"
        ];

        return {
          key: `${section.id}-${sectionIndex}-${meetingIndex}`,
          section,
          meetingTime,
          rowStart,
          rowSpan,
          colStart,
          tone: palette[sectionIndex % palette.length]
        };
      })
  );

  return (
    <div className="campus-page space-y-5">
      <section className="campus-hero">
        <p className="campus-eyebrow">Shared Schedule</p>
        <h1 className="font-heading text-3xl font-bold text-slate-900 md:text-4xl">课表快照</h1>
        <p className="mt-2 text-sm text-slate-600">
          这是一份只读课表快照，生成于 {new Date(snapshot.createdAt).toLocaleString()}。
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="campus-kpi">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sections</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{sections.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Credits</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {sections.reduce((sum, section) => sum + (section.credits ?? 0), 0)}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meeting Blocks</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {sections.reduce((sum, section) => sum + (section.meetingTimes?.length ?? 0), 0)}
          </p>
        </div>
      </section>

      <section className="campus-card overflow-hidden p-4">
        {sections.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">该快照中没有课程。</div>
        ) : (
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[900px]"
              style={{
                gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))",
                gridTemplateRows: `auto repeat(${timeSlots.length}, minmax(36px, 1fr))`
              }}
            >
              <div className="border-b border-r border-slate-100 bg-white" />
              {GRID_DAY_INDEXES.map((weekday, index) => (
                <div
                  key={weekday}
                  className="flex items-center justify-center border-b border-r border-slate-100 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-600"
                  style={{ gridColumnStart: index + 2, gridRowStart: 1 }}
                >
                  {WEEKDAY[weekday]}
                </div>
              ))}
              {timeSlots.map((slot, index) => (
                <div key={`label-${slot}`} className="border-b border-r border-slate-100 px-2 py-1 text-[11px] text-slate-400">
                  {fmt(slot)}
                </div>
              ))}
              {GRID_DAY_INDEXES.flatMap((weekday, dayIndex) =>
                timeSlots.map((slot, slotIndex) => (
                  <div
                    key={`cell-${weekday}-${slot}`}
                    className={`border-b border-r border-slate-100 ${slotIndex % 2 === 0 ? "bg-slate-50/60" : "bg-white"}`}
                    style={{ gridColumnStart: dayIndex + 2, gridRowStart: slotIndex + 2 }}
                  />
                ))
              )}
              {blocks.map((block) => (
                <div
                  key={block.key}
                  className={`z-10 mx-1 my-0.5 rounded-lg border-l-4 px-2 py-1 text-xs shadow-sm ${block.tone}`}
                  style={{
                    gridColumnStart: block.colStart,
                    gridRowStart: block.rowStart,
                    gridRowEnd: `span ${block.rowSpan}`
                  }}
                  title={`${block.section.course.title}\n${block.section.instructorName}\n${block.section.location ?? "TBA"}`}
                >
                  <p className="font-semibold">{block.section.course.code}</p>
                  <p className="text-[10px] opacity-80">
                    {fmt(block.meetingTime.startMinutes)}-{fmt(block.meetingTime.endMinutes)}
                  </p>
                  <p className="truncate text-[10px] opacity-80">§{block.section.sectionCode}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="campus-card p-4">
        <h2 className="text-sm font-semibold text-slate-900">课程列表</h2>
        <div className="mt-3 space-y-2">
          {sections.map((section) => (
            <div key={section.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">
                  {section.course.code} · {section.course.title}
                </p>
                <span className="campus-chip border-slate-200 bg-white text-slate-600">
                  §{section.sectionCode} · {section.credits} 学分
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {section.instructorName || "TBA"} · {section.location || "TBA"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {(section.meetingTimes ?? [])
                  .map((meetingTime) => `${WEEKDAY[meetingTime.weekday]} ${fmt(meetingTime.startMinutes)}-${fmt(meetingTime.endMinutes)}`)
                  .join(" / ") || "No meeting time"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="text-center text-sm text-slate-500">
        访问{" "}
        <Link href="/login" className="font-semibold text-slate-900 underline">
          University SIS 管理你的课程 →
        </Link>
      </div>
    </div>
  );
}
