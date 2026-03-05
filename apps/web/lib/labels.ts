const STATUS_LABELS: Record<string, string> = {
  ENROLLED: "Enrolled",
  WAITLISTED: "Waitlisted",
  PENDING_APPROVAL: "Pending Approval",
  DROPPED: "Dropped",
  COMPLETED: "Completed"
};

export function humanizeCode(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export function enrollmentStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? humanizeCode(status);
}

export function reasonCodeLabel(reasonCode: string): string {
  return humanizeCode(reasonCode);
}
