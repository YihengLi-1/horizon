import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serverApi } from "@/lib/server-api";

type Term = {
  id: string;
  name: string;
  maxCredits: number;
  registrationOpenAt: string;
  registrationCloseAt: string;
};

type Enrollment = {
  id: string;
  status: string;
  section: { credits: number };
};

export default async function StudentDashboardPage() {
  const terms = await serverApi<Term[]>("/academics/terms");
  const term = terms[0];
  const enrollments = term ? await serverApi<Enrollment[]>(`/registration/enrollments?termId=${term.id}`) : [];

  const enrolledCredits = enrollments
    .filter((item) => item.status === "ENROLLED" || item.status === "PENDING_APPROVAL")
    .reduce((sum, item) => sum + item.section.credits, 0);

  const waitlistedCount = enrollments.filter((item) => item.status === "WAITLISTED").length;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Current Term</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-medium">{term?.name || "No term"}</p>
          <p className="text-sm text-muted-foreground">
            Window: {term ? new Date(term.registrationOpenAt).toLocaleDateString() : "-"} to{" "}
            {term ? new Date(term.registrationCloseAt).toLocaleDateString() : "-"}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Credits</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{enrolledCredits}</p>
          <p className="text-sm text-muted-foreground">of {term?.maxCredits ?? 0} max credits</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Waitlist</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{waitlistedCount}</p>
          <p className="text-sm text-muted-foreground">sections currently waitlisted</p>
        </CardContent>
      </Card>
    </div>
  );
}
