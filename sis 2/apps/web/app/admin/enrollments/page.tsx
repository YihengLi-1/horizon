"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";

type Enrollment = {
  id: string;
  status: string;
  finalGrade: string | null;
  student: {
    studentId: string | null;
    studentProfile?: { legalName?: string };
  };
  section: {
    sectionCode: string;
    course: { code: string; title: string };
  };
};

export default function EnrollmentsPage() {
  const [rows, setRows] = useState<Enrollment[]>([]);
  const [error, setError] = useState("");
  const [gradeState, setGradeState] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const data = await apiFetch<Enrollment[]>("/admin/enrollments");
      setRows(data);
      setGradeState(Object.fromEntries(data.map((item) => [item.id, item.finalGrade || ""])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      await apiFetch(`/admin/enrollments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const updateGrade = async (id: string) => {
    const finalGrade = gradeState[id];
    if (!finalGrade) return;
    try {
      await apiFetch("/admin/enrollments/grade", {
        method: "POST",
        body: JSON.stringify({ enrollmentId: id, finalGrade })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grade update failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enrollments + Grades</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.student.studentProfile?.legalName || row.student.studentId}</TableCell>
                <TableCell>
                  {row.section.course.code} - {row.section.sectionCode}
                </TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell>
                  <Input
                    className="h-8"
                    value={gradeState[row.id] || ""}
                    onChange={(e) => setGradeState((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  />
                </TableCell>
                <TableCell className="space-x-2">
                  <Button size="sm" variant="outline" onClick={() => updateStatus(row.id, "ENROLLED")}>
                    Mark Enrolled
                  </Button>
                  <Button size="sm" onClick={() => updateGrade(row.id)}>
                    Save Grade
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
