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
  PREREQUISITE_NOT_MET: "先修课未满足",
  DUPLICATE: "重复选课",
  REGISTRATION_CLOSED: "选课已关闭",
  DROPPED_BY_STUDENT: "学生主动退课",
  DROPPED_BY_ADMIN: "管理员退课",
  WAITLIST_EXPIRED: "候补已过期",
  APPROVED: "已批准",
  REJECTED: "已拒绝",
  ALREADY_REGISTERED: "已选课/候补中",
  SECTION_ALREADY_STARTED: "教学班已开课",
  CREDIT_LIMIT_EXCEEDED: "超过学分上限",
  SECTION_NOT_FOUND: "教学班不存在",
  TERM_NOT_FOUND: "学期不存在",
  ENROLLMENT_NOT_FOUND: "注册记录不存在",
  SECTION_APPROVAL: "需要教师审批",
  CREDIT_OVERLOAD: "超学分申请",
  ACTIVE_REGISTRATION_HOLD: "存在学籍限制",
  DROP_DEADLINE_PASSED: "退课截止日期已过",
  GRADE_LOCKED: "成绩已锁定",
  REQUEST_ALREADY_PENDING: "申请审批中",
  REQUEST_ALREADY_APPROVED: "申请已批准",
  PREREQ_OVERRIDE_NOT_REQUIRED: "无需先修豁免",
};

export function humanizeCode(value: string): string {
  if (REASON_LABELS[value]) return REASON_LABELS[value];
  // Return raw code rather than mangled English for unknown codes
  return value;
}

export function enrollmentStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? humanizeCode(status);
}

export function reasonCodeLabel(reasonCode: string): string {
  return REASON_LABELS[reasonCode] ?? humanizeCode(reasonCode);
}
