"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type StudentProfile = {
  legalName: string;
  dob?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  programMajor?: string | null;
  enrollmentStatus?: string | null;
  academicStatus?: string | null;
};

type ProfileResponse = StudentProfile & {
  user: {
    email: string;
    studentId: string;
  };
};

export default function StudentProfilePage() {
  const [form, setForm] = useState<StudentProfile>({ legalName: "" });
  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch<ProfileResponse>("/students/me");
        setForm({
          legalName: data.legalName || "",
          dob: data.dob ? new Date(data.dob).toISOString().slice(0, 10) : "",
          address: data.address || "",
          emergencyContact: data.emergencyContact || "",
          programMajor: data.programMajor || "",
          enrollmentStatus: data.enrollmentStatus || "",
          academicStatus: data.academicStatus || ""
        });
        setEmail(data.user.email);
        setStudentId(data.user.studentId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      }
    }
    load();
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await apiFetch("/students/me", {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          dob: form.dob ? new Date(form.dob).toISOString() : null
        })
      });
      setMessage("Profile updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Student Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          {email} | {studentId}
        </p>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
          <Input
            placeholder="Legal Name"
            value={form.legalName}
            onChange={(e) => setForm((prev) => ({ ...prev, legalName: e.target.value }))}
          />
          <Input
            type="date"
            value={(form.dob as string) || ""}
            onChange={(e) => setForm((prev) => ({ ...prev, dob: e.target.value }))}
          />
          <Input
            placeholder="Address"
            value={form.address || ""}
            onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
          />
          <Input
            placeholder="Emergency Contact"
            value={form.emergencyContact || ""}
            onChange={(e) => setForm((prev) => ({ ...prev, emergencyContact: e.target.value }))}
          />
          <Input
            placeholder="Program Major"
            value={form.programMajor || ""}
            onChange={(e) => setForm((prev) => ({ ...prev, programMajor: e.target.value }))}
          />
          <Input
            placeholder="Enrollment Status"
            value={form.enrollmentStatus || ""}
            onChange={(e) => setForm((prev) => ({ ...prev, enrollmentStatus: e.target.value }))}
          />
          <Input
            placeholder="Academic Status"
            value={form.academicStatus || ""}
            onChange={(e) => setForm((prev) => ({ ...prev, academicStatus: e.target.value }))}
          />
          <div className="md:col-span-2">
            <Button type="submit">Save Profile</Button>
          </div>
          {message ? <p className="md:col-span-2 text-sm text-green-700">{message}</p> : null}
          {error ? <p className="md:col-span-2 text-sm text-red-600">{error}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
