import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "./App";
import { api } from "./api";
vi.mock("./api", async () => {
  const actual = await vi.importActual("./api");
  return { ...actual, api: vi.fn() };
});
const mock = vi.mocked(api);
const id = "ac6ff87c-117a-4bdd-9239-738e93d59285";
beforeEach(() => {
  mock.mockReset();
  window.history.replaceState(null, "", "#home");
  vi.spyOn(window, "confirm").mockReturnValue(false);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function session(role: string) {
  mock.mockImplementation(async (path) => {
    if (path === "/meta") return { name: "HR Platform" } as never;
    if (path === "/auth/me")
      return { id: "u", email: "user@test.local", roles: [role] } as never;
    if (path === "/dashboard")
      return {
        organizationName: "منشأة الاختبار",
        timeZone: "Asia/Riyadh",
        businessDate: "2026-10-15",
        scope: role === "Employee" ? "self" : "organization",
        currentEmployeeName: null,
        employees: {
          total: 12,
          active: 10,
          inactive: 1,
          terminated: 1,
          joinedThisMonth: 2,
        },
        structure:
          role === "HR" ? { branches: 2, departments: 3, jobs: 4 } : null,
        setup: null,
        recentEmployees: [],
        branches: [],
        activity: [],
      } as never;
    if (path.startsWith("/employees")) return { total: 0, items: [] } as never;
    if (path === "/structure")
      return {
        branches: [],
        departments: [],
        jobs: [{ id, name: "أخصائي", departmentId: "d" }],
      } as never;
    return undefined as never;
  });
}
describe("authenticated UI", () => {
  it("loads a deep employee route and prevents accidental discard of edited fields", async () => {
    session("HR");
    window.history.replaceState(null, "", "#employees/new");
    render(<App />);
    const name = await screen.findByRole("textbox", { name: "الاسم الكامل" });
    fireEvent.change(name, { target: { value: "تغيير غير محفوظ" } });
    fireEvent.click(screen.getByRole("button", { name: "إغلاق ملف الموظف" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((name as HTMLInputElement).value).toBe("تغيير غير محفوظ");
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "إغلاق ملف الموظف" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.hash).toBe("#employees");
  });
  it("retains entered data and reports server validation failure inside the employee dialog", async () => {
    session("HR");
    const normal = mock.getMockImplementation()!;
    mock.mockImplementation(async (path, method, ...args) => {
      if (path === "/employees" && method === "POST")
        throw new Error("الرقم الوظيفي مستخدم.");
      return normal(path, method, ...args);
    });
    window.history.replaceState(null, "", "#employees/new");
    render(<App />);
    fireEvent.change(
      await screen.findByRole("textbox", { name: "الاسم الكامل" }),
      { target: { value: "ملف لا يضيع" } },
    );
    fireEvent.change(screen.getByRole("textbox", { name: "الرقم الوظيفي" }), {
      target: { value: "E900" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "الوظيفة" }), {
      target: { value: id },
    });
    fireEvent.click(screen.getByRole("button", { name: "حفظ الموظف" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "الرقم الوظيفي مستخدم.",
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "الاسم الكامل",
        }) as HTMLInputElement
      ).value,
    ).toBe("ملف لا يضيع");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("sends search and status filters to the server and can reset them", async () => {
    session("HR");
    window.history.replaceState(null, "", "#employees");
    render(<App />);
    fireEvent.change(await screen.findByLabelText("بحث الموظفين"), {
      target: { value: "EMP123" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "الحالة" }), {
      target: { value: "Inactive" },
    });
    await waitFor(() =>
      expect(
        mock.mock.calls.some(([url]) =>
          url.includes("q=EMP123&status=Inactive"),
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "مسح الفلاتر" })[0]);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("بحث الموظفين") as HTMLInputElement).value,
      ).toBe(""),
    );
    expect(
      (screen.getByRole("combobox", { name: "الحالة" }) as HTMLSelectElement)
        .value,
    ).toBe("");
  });
  it("does not render privileged page content when an employee opens a forbidden hash", async () => {
    session("Employee");
    window.history.replaceState(null, "", "#users");
    render(<App />);
    await screen.findByRole("heading", { name: "ملفي في المنشأة" });
    expect(screen.queryByRole("heading", { name: "إنشاء حساب" })).toBeNull();
    expect(mock.mock.calls.some(([url]) => url === "/users")).toBe(false);
  });
  it("closes the mobile navigation when a page is chosen", async () => {
    session("HR");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "فتح القائمة" }));
    expect(
      screen
        .getByRole("button", { name: "فتح القائمة" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "الموظفون" }));
    expect(
      screen
        .getByRole("button", { name: "فتح القائمة" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(window.location.hash).toBe("#employees");
  });

  it("hides HR, payroll and administration navigation from employees", async () => {
    session("Employee");
    render(<App />);
    await screen.findByRole("button", { name: "ملفي" });
    expect(
      screen.queryByRole("button", { name: "الحسابات والصلاحيات" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "البيانات المالية" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "المنشأة والهيكل" }),
    ).toBeNull();
  });
  it("shows login errors without pretending authentication succeeded", async () => {
    mock.mockImplementation(async (path) => {
      if (path === "/meta") return { name: "HR Platform" } as never;
      throw new Error("بيانات الدخول غير صحيحة.");
    });
    render(<App />);
    await screen.findByRole("button", { name: "دخول إلى حسابك" });
    fireEvent.change(
      screen.getByRole("textbox", { name: "البريد الإلكتروني" }),
      { target: { value: "bad@test.local" } },
    );
    fireEvent.change(screen.getByLabelText("كلمة المرور"), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: "دخول إلى حسابك" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "بيانات الدخول غير صحيحة.",
    );
    expect(screen.queryByRole("button", { name: "تسجيل الخروج" })).toBeNull();
  });
  it("submits a real employee command and refreshes the list only after success", async () => {
    session("HR");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "الموظفون" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "+ إضافة موظف" }),
    );
    await screen.findByRole("textbox", { name: "الاسم الكامل" });
    fireEvent.change(screen.getByRole("textbox", { name: "الرقم الوظيفي" }), {
      target: { value: "E900" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "الاسم الكامل" }), {
      target: { value: "موظف جديد" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "الوظيفة" }), {
      target: { value: id },
    });
    fireEvent.click(screen.getByRole("button", { name: "حفظ الموظف" }));
    await waitFor(() =>
      expect(mock).toHaveBeenCalledWith(
        "/employees",
        "POST",
        expect.objectContaining({
          number: "E900",
          fullName: "موظف جديد",
          jobPositionId: id,
          managerId: null,
          version: null,
        }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("blocks committing an Excel preview containing validation errors", async () => {
    session("HR");
    const normal = mock.getMockImplementation()!;
    mock.mockImplementation(async (path, ...rest) =>
      path === "/import/employees/preview"
        ? ([{ row: 2, employee: null, error: "رقم مكرر" }] as never)
        : normal(path, ...rest),
    );
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: "استيراد الموظفين" }),
    );
    fireEvent.change(screen.getByLabelText("ملف الموظفين"), {
      target: { files: [new File(["xlsx"], "employees.xlsx")] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "معاينة وفحص الأخطاء" }),
    );
    await screen.findByText("رقم مكرر");
    expect(
      (screen.getByRole("button", { name: "حفظ 1 موظف" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      mock.mock.calls.some(([path]) => path === "/import/employees/commit"),
    ).toBe(false);
  });
});
