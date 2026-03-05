"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";

type InviteCode = {
  id: string;
  code: string;
  usedCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  active: boolean;
};

export default function InviteCodesPage() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [form, setForm] = useState({ code: "", maxUses: 100, expiresAt: "", active: true });
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const data = await apiFetch<InviteCode[]>("/admin/invite-codes");
      setCodes(data);
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
      await apiFetch("/admin/invite-codes", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          maxUses: Number(form.maxUses),
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
          active: form.active
        })
      });
      setForm({ code: "", maxUses: 100, expiresAt: "", active: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const toggleActive = async (item: InviteCode) => {
    try {
      await apiFetch(`/admin/invite-codes/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite Codes</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="mb-4 grid gap-2 md:grid-cols-4" onSubmit={onCreate}>
          <Input placeholder="Code" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} />
          <Input type="number" placeholder="Max Uses" value={form.maxUses} onChange={(e) => setForm((p) => ({ ...p, maxUses: Number(e.target.value) }))} />
          <Input type="date" value={form.expiresAt} onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))} />
          <Button type="submit">Create</Button>
        </form>
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Used</TableHead>
              <TableHead>Max</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.code}</TableCell>
                <TableCell>{item.usedCount}</TableCell>
                <TableCell>{item.maxUses ?? "-"}</TableCell>
                <TableCell>{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : "-"}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => toggleActive(item)}>
                    {item.active ? "Disable" : "Enable"}
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
