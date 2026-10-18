import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  Attendance,
  AttendanceImportPage,
  AttendanceSetup,
} from "./Attendance";
import { api } from "../api";
vi.mock("../api", async () => ({
  ...(await vi.importActual("../api")),
  api: vi.fn(),
}));
const mock = vi.mocked(api);
const notify = vi.fn(),
  navigate = vi.fn();
const employee = { id: "user", email: "alice@test.local", roles: ["Employee"] };
const context = {
  today: "2026-10-18",
  serverTimeUtc: "2026-10-18T20:00:00Z",
  timeZone: "Asia/Riyadh",
  portalEnabled: false,
  ownEmployeeId: "alice",
  ownEmployeeName: "أمل",
};
const row = {
  id: "day",
  version: "v1",
  employeeId: "alice",
  number: "EMP001",
  fullName: "أمل",
  workDate: "2026-10-15",
  shiftName: "صباحي",
  timeZone: "Asia/Riyadh",
  isRestDay: false,
  startsAtUtc: "2026-10-15T05:00:00Z",
  endsAtUtc: "2026-10-15T13:00:00Z",
  result: {
    status: "Incomplete",
    firstInUtc: "2026-10-15T05:12:00Z",
    lastOutUtc: null,
    workedMinutes: 0,
    lateMinutes: 12,
    earlyMinutes: 0,
    extraPresenceMinutes: 0,
    rawCount: 1,
    corrected: false,
    hasException: true,
  },
};
beforeEach(() => {
  mock.mockReset();
  notify.mockReset();
  navigate.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  mock.mockImplementation(async (path) => {
    if (path === "/attendance/context") return context as never;
    if (path.startsWith("/attendance/report"))
      return { total: 1, items: [row] } as never;
    if (path === "/attendance/setup")
      return { shifts: [], holidays: [], policy: null } as never;
    if (path.startsWith("/employees")) return { total: 0, items: [] } as never;
    return undefined as never;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("attendance workflows", () => {
  it("shows actual scoped attendance and distinguishes missing punches", async () => {
    render(
      <Attendance
        user={employee}
        notify={notify}
        detail=""
        onNavigate={navigate}
      />,
    );
    await screen.findByText("نقص أو تعارض بصمات");
    expect(screen.getByText("12 د تأخير")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "تعديل الجدول" })).toBeNull();
    expect(screen.queryByRole("button", { name: "تسجيل دخول" })).toBeNull();
  });
  it("submits correction times in the schedule zone and retains input when the server rejects it", async () => {
    const normal = mock.getMockImplementation()!;
    mock.mockImplementation(async (path, ...args) => {
      if (path === "/attendance/corrections")
        throw new Error("يوجد طلب معلق لهذا اليوم.");
      return normal(path, ...args);
    });
    render(
      <Attendance
        user={employee}
        notify={notify}
        detail=""
        onNavigate={navigate}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "طلب تصحيح" }));
    expect(
      (screen.getByLabelText(/الدخول الصحيح/) as HTMLInputElement).value,
    ).toBe("2026-10-15T08:00");
    fireEvent.change(screen.getByLabelText(/سبب التصحيح/), {
      target: { value: "انقطاع جهاز الحضور" },
    });
    fireEvent.click(screen.getByRole("button", { name: "إرسال للمراجعة" }));
    await screen.findByText("يوجد طلب معلق لهذا اليوم.");
    expect(
      (screen.getByLabelText(/سبب التصحيح/) as HTMLTextAreaElement).value,
    ).toBe("انقطاع جهاز الحضور");
    expect(mock).toHaveBeenCalledWith(
      "/attendance/corrections",
      "POST",
      expect.objectContaining({
        scheduleId: "day",
        firstInLocal: "2026-10-15T08:00",
        lastOutLocal: "2026-10-15T16:00",
      }),
    );
  });
  it("does not offer correction of a team member to a manager without HR access", async () => {
    render(
      <Attendance
        user={{ ...employee, roles: ["Manager"] }}
        notify={notify}
        detail=""
        onNavigate={navigate}
      />,
    );
    await screen.findByText("نقص أو تعارض بصمات");
    expect(screen.getByRole("button", { name: "طلب تصحيح" })).toBeTruthy();
    const normal = mock.getMockImplementation()!;
    mock.mockImplementation(async (path, ...args) =>
      path.startsWith("/attendance/report")
        ? ({
            total: 1,
            items: [{ ...row, employeeId: "bob", fullName: "بدر" }],
          } as never)
        : normal(path, ...args),
    );
    cleanup();
    render(
      <Attendance
        user={{ ...employee, roles: ["Manager"] }}
        notify={notify}
        detail=""
        onNavigate={navigate}
      />,
    );
    await screen.findByText("نقص أو تعارض بصمات");
    expect(screen.queryByRole("button", { name: "طلب تصحيح" })).toBeNull();
  });
  it("sends portal commands without a client timestamp and reuses request id on retry", async () => {
    const normal = mock.getMockImplementation()!;
    mock.mockImplementation(async (path, ...args) => {
      if (path === "/attendance/context")
        return { ...context, portalEnabled: true } as never;
      if (path === "/attendance/punch") throw new Error("انقطع الاتصال");
      return normal(path, ...args);
    });
    render(
      <Attendance
        user={employee}
        notify={notify}
        detail=""
        onNavigate={navigate}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "تسجيل دخول" }));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("انقطع الاتصال", "error"),
    );
    fireEvent.click(screen.getByRole("button", { name: "تسجيل دخول" }));
    await waitFor(() =>
      expect(
        mock.mock.calls.filter(([path]) => path === "/attendance/punch").length,
      ).toBe(2),
    );
    const calls = mock.mock.calls.filter(
      ([path]) => path === "/attendance/punch",
    );
    expect(calls[0][2]).toEqual(calls[1][2]);
    expect(Object.keys(calls[0][2] as object).sort()).toEqual([
      "kind",
      "requestId",
    ]);
  });
  it("prevents importing a workbook with errors while allowing duplicates to be skipped", async () => {
    const normal = mock.getMockImplementation()!;
    mock.mockImplementation(async (path, ...args) =>
      path === "/attendance/import/preview"
        ? ([
            {
              row: 2,
              number: "UNKNOWN",
              fullName: null,
              occurredAtUtc: null,
              kind: "In",
              duplicate: false,
              error: "الرقم الوظيفي غير موجود.",
            },
          ] as never)
        : normal(path, ...args),
    );
    render(<AttendanceImportPage notify={notify} />);
    fireEvent.change(screen.getByLabelText("ملف حركات الحضور"), {
      target: { files: [new File(["xlsx"], "punches.xlsx")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "معاينة الحركات" }));
    await screen.findByText("الرقم الوظيفي غير موجود.");
    expect(
      (screen.getByRole("button", { name: "حفظ الحركات" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      mock.mock.calls.some(([p]) => p === "/attendance/import/commit"),
    ).toBe(false);
  });
  it("requires a review note when rejecting a correction", async () => {
    const normal = mock.getMockImplementation()!;
    mock.mockImplementation(async (path, ...args) =>
      path.startsWith("/attendance/corrections")
        ? ({
            total: 1,
            items: [
              {
                ...row,
                id: "request",
                status: "Pending",
                firstInUtc: row.startsAtUtc,
                lastOutUtc: row.endsAtUtc,
                reason: "طلب مراجعة",
                reviewNote: "",
                canReview: true,
                canCancel: false,
              },
            ],
          } as never)
        : normal(path, ...args),
    );
    render(
      <Attendance
        user={{ ...employee, roles: ["HR"] }}
        notify={notify}
        detail="requests"
        onNavigate={navigate}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "رفض التصحيح" }));
    expect(
      (screen.getByLabelText(/ملاحظة القرار/) as HTMLTextAreaElement).required,
    ).toBe(true);
  });
  it("hides portal policy controls from HR while making actual shift setup available", async () => {
    render(
      <AttendanceSetup user={{ ...employee, roles: ["HR"] }} notify={notify} />,
    );
    await screen.findByText("شفتات العمل");
    expect(screen.queryByText("السماح بالتسجيل من البوابة")).toBeNull();
    expect(
      screen.getByRole("button", { name: "حفظ تعريف الشفت" }),
    ).toBeTruthy();
  });
});
