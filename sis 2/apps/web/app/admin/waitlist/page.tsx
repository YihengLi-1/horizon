"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";

type WaitlistRow = {
  id: string;
  waitlistPosition: number | null;
  student: {
    studentId: string | null;
    studentProfile?: { legalName?: string };
  };
  section: {
    id: string;
    sectionCode: string;
    course: { code: string; title: string };
  };
};

export default function WaitlistPage() {
  const [rows, setRows] = useState<WaitlistRow[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const data = await apiFetch<WaitlistRow[]>("/admin/waitlist");
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const promote = async (sectionId: string) => {
    try {
      await apiFetch("/admin/waitlist/promote", {
        method: "POST",
        body: JSON.stringify({ sectionId })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promote failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Waitlist</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Section</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Position</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {row.section.course.code} - {row.section.sectionCode}
                </TableCell>
                <TableCell>{row.student.studentProfile?.legalName || row.student.studentId}</TableCell>
                <TableCell>{row.waitlistPosition}</TableCell>
                <TableCell>
                  <Button size="sm" onClick={() => promote(row.section.id)}>
                    Promote Next
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
