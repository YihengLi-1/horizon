"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";

type Course = {
  id: string;
  code: string;
  title: string;
  credits: number;
  prerequisiteLinks: Array<{ prerequisiteCourse: { code: string } }>;
};

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [form, setForm] = useState({ code: "", title: "", credits: 3, description: "", prerequisiteCourseIds: "" });
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const data = await apiFetch<Course[]>("/admin/courses");
      setCourses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await apiFetch("/admin/courses", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          title: form.title,
          credits: Number(form.credits),
          description: form.description || null,
          prerequisiteCourseIds: form.prerequisiteCourseIds
            ? form.prerequisiteCourseIds
                .split(",")
                .map((id) => id.trim())
                .filter(Boolean)
            : []
        })
      });
      setForm({ code: "", title: "", credits: 3, description: "", prerequisiteCourseIds: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete course?")) return;
    try {
      await apiFetch(`/admin/courses/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Courses</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="mb-4 grid gap-2 md:grid-cols-5" onSubmit={onCreate}>
          <Input placeholder="Code" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} />
          <Input placeholder="Title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          <Input type="number" placeholder="Credits" value={form.credits} onChange={(e) => setForm((p) => ({ ...p, credits: Number(e.target.value) }))} />
          <Input placeholder="Prereq IDs (comma)" value={form.prerequisiteCourseIds} onChange={(e) => setForm((p) => ({ ...p, prerequisiteCourseIds: e.target.value }))} />
          <Button type="submit">Create Course</Button>
        </form>
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Credits</TableHead>
              <TableHead>Prerequisites</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {courses.map((course) => (
              <TableRow key={course.id}>
                <TableCell>{course.code}</TableCell>
                <TableCell>{course.title}</TableCell>
                <TableCell>{course.credits}</TableCell>
                <TableCell>{course.prerequisiteLinks.map((item) => item.prerequisiteCourse.code).join(", ") || "-"}</TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" onClick={() => onDelete(course.id)}>
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
