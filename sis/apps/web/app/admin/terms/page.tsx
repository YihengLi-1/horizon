"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";

type Term = {
  id: string;
  name: string;
  maxCredits: number;
  timezone: string;
  startDate: string;
  endDate: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  dropDeadline: string;
};

export default function TermsPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    startDate: "",
    endDate: "",
    registrationOpenAt: "",
    registrationCloseAt: "",
    dropDeadline: "",
    maxCredits: 12,
    timezone: "America/Phoenix"
  });

  const load = async () => {
    try {
      const data = await apiFetch<Term[]>("/admin/terms");
      setTerms(data);
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
      await apiFetch("/admin/terms", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          startDate: new Date(form.startDate).toISOString(),
          endDate: new Date(form.endDate).toISOString(),
          registrationOpenAt: new Date(form.registrationOpenAt).toISOString(),
          registrationCloseAt: new Date(form.registrationCloseAt).toISOString(),
          dropDeadline: new Date(form.dropDeadline).toISOString()
        })
      });
      setForm({
        name: "",
        startDate: "",
        endDate: "",
        registrationOpenAt: "",
        registrationCloseAt: "",
        dropDeadline: "",
        maxCredits: 12,
        timezone: "America/Phoenix"
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Terms</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="mb-4 grid gap-2 md:grid-cols-4" onSubmit={onCreate}>
          <Input placeholder="Term name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <Input type="datetime-local" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
          <Input type="datetime-local" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
          <Input type="datetime-local" value={form.registrationOpenAt} onChange={(e) => setForm((p) => ({ ...p, registrationOpenAt: e.target.value }))} />
          <Input type="datetime-local" value={form.registrationCloseAt} onChange={(e) => setForm((p) => ({ ...p, registrationCloseAt: e.target.value }))} />
          <Input type="datetime-local" value={form.dropDeadline} onChange={(e) => setForm((p) => ({ ...p, dropDeadline: e.target.value }))} />
          <Input type="number" value={form.maxCredits} onChange={(e) => setForm((p) => ({ ...p, maxCredits: Number(e.target.value) }))} />
          <Input value={form.timezone} onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))} />
          <Button type="submit">Create Term</Button>
        </form>
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Date Range</TableHead>
              <TableHead>Reg Window</TableHead>
              <TableHead>Drop Deadline</TableHead>
              <TableHead>Max Credits</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {terms.map((term) => (
              <TableRow key={term.id}>
                <TableCell>{term.name}</TableCell>
                <TableCell>
                  {new Date(term.startDate).toLocaleDateString()} - {new Date(term.endDate).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {new Date(term.registrationOpenAt).toLocaleDateString()} -{" "}
                  {new Date(term.registrationCloseAt).toLocaleDateString()}
                </TableCell>
                <TableCell>{new Date(term.dropDeadline).toLocaleDateString()}</TableCell>
                <TableCell>{term.maxCredits}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
