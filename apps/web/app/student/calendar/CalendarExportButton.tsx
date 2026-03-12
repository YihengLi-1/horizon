"use client";

type Term = {
  name: string;
  startDate: string;
  endDate: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  dropDeadline?: string | null;
};

function icsDate(iso: string): string {
  // format: YYYYMMDDTHHMMSSZ
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "").replace(" ", "T");
}

function makeVEvent(uid: string, summary: string, dtstart: string, description: string): string {
  const dt = icsDate(dtstart);
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${dt}`,
    `DTEND:${dt}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT"
  ].join("\r\n");
}

export default function CalendarExportButton({ terms }: { terms: Term[] }) {
  function handleExport() {
    const events: string[] = [];

    for (const term of terms) {
      const t = term.name.replace(/\s+/g, "_");
      events.push(makeVEvent(`reg-open-${t}@sis`, `[${term.name}] Registration Opens`, term.registrationOpenAt, `Registration opens for ${term.name}`));
      events.push(makeVEvent(`reg-close-${t}@sis`, `[${term.name}] Registration Closes`, term.registrationCloseAt, `Registration deadline for ${term.name}`));
      if (term.dropDeadline) {
        events.push(makeVEvent(`drop-${t}@sis`, `[${term.name}] Drop Deadline`, term.dropDeadline, `Last day to drop without academic penalty - ${term.name}`));
      }
      events.push(makeVEvent(`term-end-${t}@sis`, `[${term.name}] Term Ends`, term.endDate, `End of ${term.name}`));
    }

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//SIS Academic Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Academic Calendar",
      "X-WR-TIMEZONE:UTC",
      ...events,
      "END:VCALENDAR"
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "academic-calendar.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleExport}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
      title="Download as calendar (.ics)"
    >
      📅 Export to Calendar (.ics)
    </button>
  );
}
