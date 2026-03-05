import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { serverApi } from "@/lib/server-api";

type GradeItem = {
  id: string;
  finalGrade: string;
  term: { name: string };
  section: {
    course: {
      code: string;
      title: string;
    };
  };
};

export default async function GradesPage() {
  const grades = await serverApi<GradeItem[]>("/registration/grades");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grades</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Term</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Final Grade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grades.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.term.name}</TableCell>
                <TableCell>
                  {item.section.course.code} - {item.section.course.title}
                </TableCell>
                <TableCell>{item.finalGrade}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
