"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";

type Student = {
  id: string;
  email: string;
  studentId: string;
  studentProfile?: {
    legalName?: string;
    programMajor?: string;
  };
};

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [form, setForm] = useState({
    legalName: "",
    studentId: "",
    email: "",
    password: "Student123!",
    role: "STUDENT"
  });
  const [error, setError] = useState("");

  const loadStudents = async () => {
    try {
      const data = await apiFetch<Student[]>("/students");
      setStudents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await apiFetch("/students", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setForm({ legalName: "", studentId: "", email: "", password: "Student123!", role: "STUDENT" });
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete student?")) return;
    try {
      await apiFetch(`/students/${id}`, { method: "DELETE" });
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Students</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="mb-4 grid gap-2 md:grid-cols-5" onSubmit={onCreate}>
          <Input placeholder="Legal Name" value={form.legalName} onChange={(e) => setForm((p) => ({ ...p, legalName: e.target.value }))} />
          <Input placeholder="Student ID" value={form.studentId} onChange={(e) => setForm((p) => ({ ...p, studentId: e.target.value }))} />
          <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          <Input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
          <Button type="submit">Add Student</Button>
        </form>
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Student ID</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Major</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student) => (
              <TableRow key={student.id}>
                <TableCell>{student.studentProfile?.legalName || "-"}</TableCell>
                <TableCell>{student.studentId}</TableCell>
                <TableCell>{student.email}</TableCell>
                <TableCell>{student.studentProfile?.programMajor || "-"}</TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" onClick={() => onDelete(student.id)}>
                    Delete
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
