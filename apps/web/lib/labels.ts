const STATUS_LABELS: Record<string, string> = {
  ENROLLED: "已选课",
  WAITLISTED: "候补",
  PENDING_APPROVAL: "待审批",
  DROPPED: "已退课",
  COMPLETED: "已完成",
  IN_CART: "购物车",
  CART: "购物车",
  NONE: "未选课",
};

const REASON_LABELS: Record<string, string> = {
  SECTION_FULL: "班级已满",
  TIME_CONFLICT: "时间冲突",
  PREREQ_NOT_MET: "先修课未满足",
  DUPLICATE: "重复选课",
  REGISTRATION_CLOSED: "选课已关闭",
  DROPPED_BY_STUDENT: "学生主动退课",
  DROPPED_BY_ADMIN: "管理员退课",
  WAITLIST_EXPIRED: "候补已过期",
  APPROVED: "已批准",
  REJECTED: "已拒绝",
};

export function humanizeCode(value: string): string {
  if (REASON_LABELS[value]) return REASON_LABELS[value];
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
  return REASON_LABELS[reasonCode] ?? humanizeCode(reasonCode);
}
