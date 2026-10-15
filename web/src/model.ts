export type User = { id: string; email: string; roles: string[] };
export type Employee = {
  id: string;
  version: string;
  number: string;
  fullName: string;
  email: string;
  phone: string;
  joinDate: string;
  status: string;
  contractType: string;
  jobPositionId: string;
  managerId: string | null;
  jobTitle?: string | null;
  department?: string | null;
  branch?: string | null;
  managerName?: string | null;
  canReadAttachments?: boolean;
};
export type Page<T> = { total: number; items: T[] };
export type Unit = {
  id: string;
  name: string;
  version: string;
  branchId?: string;
  departmentId?: string;
};
export type Structure = { branches: Unit[]; departments: Unit[]; jobs: Unit[] };
export type Org = { name: string; timeZone: string; version: string };
export type Notice = (
  text: string,
  tone?: "success" | "error" | "info",
) => void;
export type Section =
  | "home"
  | "employees"
  | "organization"
  | "import"
  | "users"
  | "audit"
  | "financial"
  | "security";
export type Navigate = (section: Section, detail?: string) => void;
export type Activity = {
  id: number;
  occurredAt: string;
  actorId: string;
  actorName: string;
  action: string;
  entityId: string;
};
export type Dashboard = {
  organizationName: string;
  timeZone: string;
  businessDate: string;
  currentEmployeeName: string | null;
  scope: "organization" | "team" | "self" | "financial";
  employees: {
    total: number;
    active: number;
    inactive: number;
    terminated: number;
    joinedThisMonth: number;
  } | null;
  structure: { branches: number; departments: number; jobs: number } | null;
  setup: {
    organization: boolean;
    branches: boolean;
    departments: boolean;
    jobs: boolean;
    employees: boolean;
    linkedAccounts: boolean;
  } | null;
  recentEmployees: {
    id: string;
    number: string;
    fullName: string;
    status: string;
    joinDate: string;
    job: string;
    department: string;
    branch: string;
  }[];
  branches: { id: string; name: string; employees: number }[];
  activity: Activity[];
};
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "تعذر إكمال العملية. حاول مرة أخرى.";
export const hasRole = (user: User, ...roles: string[]) =>
  user.roles.some((r) => roles.includes(r));
export const statusLabel = (status: string) =>
  status === "Active"
    ? "نشط"
    : status === "Inactive"
      ? "غير نشط"
      : "منتهي الخدمة";
export const todayInZone = (zone = "Asia/Riyadh") =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const date = () => todayInZone();
export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value + "T12:00:00Z"));
export const activityLabel = (action: string) => {
  const [entity, verb] = action.split(".");
  const entities: Record<string, string> = {
    Employee: "ملف موظف",
    Organization: "المنشأة",
    Branch: "فرع",
    Department: "قسم",
    JobPosition: "وظيفة",
    EmployeeFinancial: "بيانات مالية",
    Attachment: "مرفق",
    User: "حساب مستخدم",
  };
  const verbs: Record<string, string> = {
    Added: "إضافة",
    Modified: "تحديث",
    Created: "إنشاء",
    RoleChanged: "تغيير صلاحية",
    Enabled: "تفعيل",
    Disabled: "تعطيل",
    PasswordChanged: "تغيير كلمة مرور",
  };
  return `${verbs[verb] ?? "تحديث"} ${entities[entity] ?? "سجل"}`;
};
