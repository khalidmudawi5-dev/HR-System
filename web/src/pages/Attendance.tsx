import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, formValues } from "../api";
import { useDebouncedValue, useLoad } from "../hooks";
import {
  type User,
  type Notice,
  type Navigate,
  type Page,
  type Employee,
  errorText,
  hasRole,
  formatDate,
} from "../model";
import { Field, Icon, State, Empty, Pager, Modal, Avatar } from "../ui";

type Context = {
  timeZone: string;
  today: string;
  serverTimeUtc: string;
  portalEnabled: boolean;
  ownEmployeeId: string | null;
  ownEmployeeName: string | null;
};
type Shift = {
  id: string;
  name: string;
  startMinute: number;
  endMinute: number;
  endsNextDay: boolean;
  breakOffsetMinutes: number;
  breakMinutes: number;
  arrivalGraceMinutes: number;
  departureGraceMinutes: number;
  captureBeforeMinutes: number;
  captureAfterMinutes: number;
};
type Setup = {
  shifts: Shift[];
  holidays: { id: string; version: string; date: string; name: string }[];
  policy: { version: string; portalEnabled: boolean } | null;
};
type AttendanceResult = {
  status: string;
  firstInUtc: string | null;
  lastOutUtc: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  extraPresenceMinutes: number;
  rawCount: number;
  corrected: boolean;
  hasException: boolean;
};
type Row = {
  id: string;
  version: string;
  employeeId: string;
  number: string;
  fullName: string;
  workDate: string;
  shiftName: string;
  timeZone: string;
  isRestDay: boolean;
  startsAtUtc: string | null;
  endsAtUtc: string | null;
  result: AttendanceResult;
};
type Correction = {
  id: string;
  version: string;
  number: string;
  fullName: string;
  workDate: string;
  timeZone: string;
  firstInUtc: string;
  lastOutUtc: string;
  reason: string;
  status: string;
  reviewNote: string;
  requestedAtUtc: string;
  canReview: boolean;
  canCancel: boolean;
};
const statusNames: Record<string, string> = {
  Present: "مكتمل",
  Absent: "غياب",
  Incomplete: "نقص أو تعارض بصمات",
  Scheduled: "مجدول",
  InProgress: "قيد المتابعة",
  RestDay: "راحة أسبوعية",
  Holiday: "عطلة",
  Pending: "بانتظار الاعتماد",
  Approved: "معتمد",
  Rejected: "مرفوض",
  Cancelled: "مسحوب",
};
const utc = (value: string) =>
  new Date(/[Zz]|[+-]\d\d:\d\d$/.test(value) ? value : value + "Z");
const stamp = (value: string | null, zone: string) =>
  value
    ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
        timeZone: zone,
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(utc(value))
    : "—";
const local = (value: string, zone: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(utc(value))
    .replace(" ", "T");
const minutes = (n: number) => `${Math.floor(n / 60)} س ${n % 60} د`;
const clockLabel = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const offsetDate = (date: string, offset: number) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
function Badge({ status }: { status: string }) {
  return (
    <span
      className={`attendance-badge ${["Absent", "Incomplete", "Rejected"].includes(status) ? "warn" : status === "Approved" || status === "Present" ? "good" : ""}`}
    >
      {statusNames[status] ?? status}
    </span>
  );
}
function useSmallScreen() {
  const [small, setSmall] = useState(
    () => window.matchMedia?.("(max-width: 760px)").matches ?? false,
  );
  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 760px)");
    if (!query) return;
    const update = () => setSmall(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return small;
}
export function Attendance({
  user,
  notify,
  detail,
  onNavigate,
}: {
  user: User;
  notify: Notice;
  detail: string;
  onNavigate: Navigate;
}) {
  const hr = hasRole(user, "Administrator", "HR");
  const small = useSmallScreen();
  const [revision, setRevision] = useState(0);
  const context = useLoad<Context>("/attendance/context", revision);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row | null>(null);
  const [edit, setEdit] = useState<Row | null>(null);
  const search = useDebouncedValue(q);
  const tab = ["raw", "requests"].includes(detail) ? detail : "report";
  useEffect(() => {
    if (context.data && !from) {
      setFrom(offsetDate(context.data.today, -6));
      setTo(context.data.today);
    }
  }, [context.data, from]);
  const valid =
    !!from &&
    !!to &&
    to >= from &&
    (new Date(to).getTime() - new Date(from).getTime()) / 86400000 <= 30;
  const report = useLoad<Page<Row> & { calculatedAtUtc: string }>(
    tab === "report" && valid
      ? `/attendance/report?from=${from}&to=${to}&q=${encodeURIComponent(search)}&page=${page}`
      : null,
    revision,
  );
  const changed = () => {
    setRevision((v) => v + 1);
  };
  return (
    <>
      <State error={context.error} loading={!context.data && !context.error}>
        {context.data && (
          <Portal context={context.data} notify={notify} onChanged={changed} />
        )}
      </State>
      <div
        className="attendance-tabs"
        role="navigation"
        aria-label="أقسام الحضور"
      >
        {[
          ["report", "سجل الحضور"],
          ["raw", "الحركات الخام"],
          ["requests", "طلبات التصحيح"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            className={tab === id ? "selected" : ""}
            onClick={() => {
              setPage(1);
              onNavigate("attendance", id === "report" ? "" : id);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab !== "requests" && (
        <section className="card attendance-filter">
          <Field label="من تاريخ">
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="إلى تاريخ">
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </Field>
          {tab === "report" && (
            <Field label="بحث الحضور">
              <input
                maxLength={160}
                placeholder="اسم الموظف أو رقمه"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
          )}
          <button aria-label="تحديث الحضور" onClick={changed}>
            <Icon name="refresh" />
            تحديث
          </button>
          {!valid && from && (
            <p className="error" role="alert">
              اختر فترة حتى 31 يومًا، ونهايتها بعد بدايتها.
            </p>
          )}
        </section>
      )}
      {tab === "report" && valid && (
        <>
          <div className="attendance-kpis" aria-label="مؤشرات السجلات المعروضة">
            <div>
              <span>سجلات هذه الصفحة</span>
              <strong>{report.data?.items.length ?? "—"}</strong>
            </div>
            <div>
              <span>استثناءات هذه الصفحة</span>
              <strong>
                {report.data?.items.filter((r) => r.result.hasException)
                  .length ?? "—"}
              </strong>
            </div>
            <div>
              <span>تصحيحات معتمدة معروضة</span>
              <strong>
                {report.data?.items.filter((r) => r.result.corrected).length ??
                  "—"}
              </strong>
            </div>
          </div>
          <section className="card no-padding">
            <div className="panel-heading section-heading">
              <div>
                <h2>متابعة الحضور</h2>
                <p className="muted">
                  النتائج تُحسب من الحركات الأصلية والتصحيحات المعتمدة عند كل
                  تحديث.
                </p>
              </div>
              {hr && (
                <button onClick={() => onNavigate("attendanceSetup")}>
                  إدارة الجداول
                  <Icon name="calendar" size={17} />
                </button>
              )}
            </div>
            <State error={report.error} loading={!report.data && !report.error}>
              {report.data?.items.length ? (
                small ? (
                  <AttendanceCards
                    rows={report.data.items}
                    own={context.data?.ownEmployeeId}
                    hr={hr}
                    onCorrect={setSelected}
                    onEdit={setEdit}
                  />
                ) : (
                  <div className="table-scroll">
                    <table className="attendance-table">
                      <thead>
                        <tr>
                          <th>الموظف / اليوم</th>
                          <th>الشفت</th>
                          <th>الدخول / الخروج</th>
                          <th>العمل داخل الشفت</th>
                          <th>التأخير / المبكر</th>
                          <th>النتيجة</th>
                          <th>الإجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.data.items.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <strong>{r.fullName}</strong>
                              <small className="code">{r.number}</small>
                              <small>{formatDate(r.workDate)}</small>
                            </td>
                            <td>
                              <strong>{r.shiftName}</strong>
                              <small>{stamp(r.startsAtUtc, r.timeZone)}</small>
                              <small>{stamp(r.endsAtUtc, r.timeZone)}</small>
                            </td>
                            <td>
                              <span>
                                {stamp(r.result.firstInUtc, r.timeZone)}
                              </span>
                              <small>
                                {stamp(r.result.lastOutUtc, r.timeZone)}
                              </small>
                              <small>
                                {r.result.rawCount} حركة أصلية
                                {r.result.corrected ? " · مصحح باعتماد" : ""}
                              </small>
                            </td>
                            <td>
                              <strong>{minutes(r.result.workedMinutes)}</strong>
                              {r.result.extraPresenceMinutes > 0 && (
                                <small>
                                  {minutes(r.result.extraPresenceMinutes)} خارج
                                  الشفت
                                </small>
                              )}
                            </td>
                            <td>
                              <span>{r.result.lateMinutes} د تأخير</span>
                              <small>
                                {r.result.earlyMinutes} د انصراف مبكر
                              </small>
                            </td>
                            <td>
                              <Badge status={r.result.status} />
                            </td>
                            <td>
                              <div className="attendance-row-actions">
                                {!r.isRestDay &&
                                  !r.result.corrected &&
                                  (hr ||
                                    context.data?.ownEmployeeId ===
                                      r.employeeId) && (
                                    <button
                                      className="text-button"
                                      onClick={() => setSelected(r)}
                                    >
                                      طلب تصحيح
                                    </button>
                                  )}
                                {hr && (
                                  <button
                                    className="text-button"
                                    onClick={() => setEdit(r)}
                                  >
                                    تعديل الجدول
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <Empty
                  title="لا توجد أيام مجدولة في الفترة"
                  description={
                    hr
                      ? "أنشئ الشفت ثم وزّعه على الموظفين من إدارة الجداول."
                      : "سيظهر حضورك بعد إعداد جدولك من إدارة الموارد البشرية."
                  }
                  action={
                    hr ? (
                      <button onClick={() => onNavigate("attendanceSetup")}>
                        إعداد الجداول
                      </button>
                    ) : undefined
                  }
                />
              )}
              <Pager
                page={page}
                setPage={setPage}
                total={report.data?.total ?? 0}
              />
            </State>
          </section>
          <p className="notice">
            الوقت خارج الشفت يوضح الحضور فقط؛ لا يمثل إضافيًا معتمدًا أو مبلغًا
            في الرواتب. يبدأ احتساب الغياب النهائي بعد إغلاق نافذة استقبال
            الحركات.
          </p>
        </>
      )}
      {tab === "raw" && valid && (
        <RawPunches
          from={from}
          to={to}
          zone={context.data?.timeZone ?? "Asia/Riyadh"}
          revision={revision}
        />
      )}
      {tab === "requests" && (
        <Corrections notify={notify} revision={revision} onChanged={changed} />
      )}
      {selected && (
        <CorrectionForm
          row={selected}
          notify={notify}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            changed();
            onNavigate("attendance", "requests");
          }}
        />
      )}
      {edit && (
        <ScheduleEditor
          row={edit}
          notify={notify}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            changed();
          }}
        />
      )}
    </>
  );
}
function AttendanceCards({
  rows,
  own,
  hr,
  onCorrect,
  onEdit,
}: {
  rows: Row[];
  own?: string | null;
  hr: boolean;
  onCorrect: (r: Row) => void;
  onEdit: (r: Row) => void;
}) {
  return (
    <div className="attendance-cards">
      {rows.map((r) => (
        <article key={r.id} className="attendance-day-card">
          <div className="table-person">
            <Avatar name={r.fullName} />
            <div>
              <strong>{r.fullName}</strong>
              <small>
                {r.number} · {formatDate(r.workDate)}
              </small>
            </div>
          </div>
          <div className="attendance-day-status">
            <span>{r.shiftName}</span>
            <Badge status={r.result.status} />
          </div>
          <dl>
            <div>
              <dt>بداية / نهاية الشفت</dt>
              <dd>
                {stamp(r.startsAtUtc, r.timeZone)}
                <br />
                {stamp(r.endsAtUtc, r.timeZone)}
              </dd>
            </div>
            <div>
              <dt>الدخول / الخروج</dt>
              <dd>
                {stamp(r.result.firstInUtc, r.timeZone)}
                <br />
                {stamp(r.result.lastOutUtc, r.timeZone)}
              </dd>
            </div>
            <div>
              <dt>العمل داخل الشفت</dt>
              <dd>{minutes(r.result.workedMinutes)}</dd>
            </div>
            <div>
              <dt>التأخير / المبكر</dt>
              <dd>
                {r.result.lateMinutes} د / {r.result.earlyMinutes} د
              </dd>
            </div>
          </dl>
          <p>
            {r.result.rawCount} حركة أصلية
            {r.result.corrected ? " · تصحيح معتمد" : ""}
            {r.result.extraPresenceMinutes > 0
              ? ` · ${minutes(r.result.extraPresenceMinutes)} خارج الشفت`
              : ""}
          </p>
          <div className="attendance-row-actions">
            {!r.isRestDay &&
              !r.result.corrected &&
              (hr || own === r.employeeId) && (
                <button onClick={() => onCorrect(r)}>طلب تصحيح</button>
              )}
            {hr && <button onClick={() => onEdit(r)}>تعديل الجدول</button>}
          </div>
        </article>
      ))}
    </div>
  );
}
function Portal({
  context,
  notify,
  onChanged,
}: {
  context: Context;
  notify: Notice;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const retry = useRef<{ kind: string; id: string } | null>(null);
  const [last, setLast] = useState("");
  async function punch(kind: string) {
    if (busy) return;
    setBusy(true);
    if (retry.current?.kind !== kind)
      retry.current = { kind, id: crypto.randomUUID() };
    try {
      const p = await api<{ occurredAtUtc: string }>(
        "/attendance/punch",
        "POST",
        { kind, requestId: retry.current!.id },
      );
      setLast(
        `${kind === "In" ? "دخول" : "خروج"} · ${stamp(p.occurredAtUtc, context.timeZone)}`,
      );
      retry.current = null;
      notify("تم تسجيل الحركة بوقت الخادم.");
      onChanged();
    } catch (e) {
      notify(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="attendance-hero">
      <div>
        <span className="eyebrow">يوم العمل · {formatDate(context.today)}</span>
        <h2>
          {context.ownEmployeeName
            ? `حضورك، ${context.ownEmployeeName}`
            : "الحضور والانصراف"}
        </h2>
        <p>المنطقة الزمنية: {context.timeZone} · الوقت المعتمد من الخادم.</p>
        {last && <strong role="status">آخر تسجيل: {last}</strong>}
      </div>
      <div className="portal-actions">
        {context.portalEnabled && context.ownEmployeeId ? (
          <>
            <button
              className="primary"
              disabled={busy}
              onClick={() => punch("In")}
            >
              <Icon name="check" />
              {busy ? "جارٍ التسجيل…" : "تسجيل دخول"}
            </button>
            <button disabled={busy} onClick={() => punch("Out")}>
              تسجيل خروج
            </button>
            <small>يشترط شفت حالي. التسجيل عن بُعد حسب سياسة المنشأة.</small>
          </>
        ) : (
          <span className="portal-disabled">
            <Icon name="lock" />
            {!context.ownEmployeeId
              ? "لا يوجد ملف موظف مرتبط بحسابك."
              : "تسجيل البوابة غير مفعل؛ الحركات تستوردها الإدارة."}
          </span>
        )}
      </div>
    </section>
  );
}
function RawPunches({
  from,
  to,
  zone,
  revision,
}: {
  from: string;
  to: string;
  zone: string;
  revision: number;
}) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [from, to]);
  const { data, error } = useLoad<
    Page<{
      id: string;
      number: string;
      fullName: string;
      occurredAtUtc: string;
      kind: string;
      source: string;
      recordedAtUtc: string;
    }>
  >(`/attendance/punches?from=${from}&to=${to}&page=${page}`, revision);
  return (
    <section className="card">
      <h2>الحركات الأصلية</h2>
      <p className="muted">
        سجل للقراءة فقط. التصحيح المعتمد لا يغيّر الحركة الأصلية.
      </p>
      <State error={error} loading={!data && !error}>
        {data?.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>وقت الحركة</th>
                  <th>النوع</th>
                  <th>المصدر</th>
                  <th>وقت الإضافة</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.fullName}</strong>
                      <small className="code">{p.number}</small>
                    </td>
                    <td>{stamp(p.occurredAtUtc, zone)}</td>
                    <td>{p.kind === "In" ? "دخول" : "خروج"}</td>
                    <td>{p.source === "Portal" ? "البوابة" : "Excel"}</td>
                    <td>{stamp(p.recordedAtUtc, zone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="لا توجد حركات في الفترة"
            description="تظهر هنا حركات الاستيراد والتسجيل من البوابة ضمن صلاحياتك."
          />
        )}
        <Pager page={page} setPage={setPage} total={data?.total ?? 0} />
      </State>
    </section>
  );
}
function CorrectionForm({
  row,
  notify,
  onClose,
  onSaved,
}: {
  row: Row;
  notify: Notice;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  return (
    <Modal
      closeLabel="إغلاق النافذة"
      title="طلب تصحيح الحضور"
      subtitle={`${row.fullName} · ${formatDate(row.workDate)} · ${row.timeZone}`}
      onClose={() => {
        if (
          !busy &&
          (!dirty || confirm("توجد بيانات غير محفوظة. إغلاق الطلب؟"))
        )
          onClose();
      }}
      busy={busy}
    >
      <form
        className="attendance-modal-form"
        onChange={() => setDirty(true)}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("/attendance/corrections", "POST", {
              ...formValues(e.currentTarget),
              scheduleId: row.id,
            });
            notify("أُرسل طلب التصحيح للمراجعة.");
            onSaved();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="notice">
          أدخل الأوقات بتوقيت {row.timeZone}. يلزم انتهاء الشفت واعتماد شخص آخر.
          الحركات الأصلية تبقى محفوظة.
        </p>
        <div className="form-grid">
          <Field label="الدخول الصحيح" required>
            <input
              required
              type="datetime-local"
              name="firstInLocal"
              defaultValue={
                row.startsAtUtc ? local(row.startsAtUtc, row.timeZone) : ""
              }
            />
          </Field>
          <Field label="الخروج الصحيح" required>
            <input
              required
              type="datetime-local"
              name="lastOutLocal"
              defaultValue={
                row.endsAtUtc ? local(row.endsAtUtc, row.timeZone) : ""
              }
            />
          </Field>
        </div>
        <Field label="سبب التصحيح" required>
          <textarea required name="reason" maxLength={500} rows={3} />
        </Field>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "جارٍ الإرسال…" : "إرسال للمراجعة"}
        </button>
      </form>
    </Modal>
  );
}
function Corrections({
  notify,
  revision,
  onChanged,
}: {
  notify: Notice;
  revision: number;
  onChanged: () => void;
}) {
  const [page, setPage] = useState(1);
  const { data, error } = useLoad<Page<Correction>>(
    `/attendance/corrections?page=${page}`,
    revision,
  );
  const [decision, setDecision] = useState<{
    request: Correction;
    decision: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <>
      <section className="card">
        <h2>طلبات تصحيح الحضور</h2>
        <p className="muted">
          يراجع المدير المباشر أو الموارد البشرية طلبات نطاقه. لا يجوز اعتماد
          الطلب الشخصي أو الطلب الذي قدمه المراجع.
        </p>
        <State error={error} loading={!data && !error}>
          {data?.items.length ? (
            <div className="correction-list">
              {data.items.map((c) => (
                <article key={c.id}>
                  <div className="section-heading">
                    <div>
                      <strong>{c.fullName}</strong>
                      <small>
                        {c.number} · {formatDate(c.workDate)}
                      </small>
                    </div>
                    <Badge status={c.status} />
                  </div>
                  <div className="correction-times">
                    <span>
                      الدخول المقترح
                      <strong>{stamp(c.firstInUtc, c.timeZone)}</strong>
                    </span>
                    <span>
                      الخروج المقترح
                      <strong>{stamp(c.lastOutUtc, c.timeZone)}</strong>
                    </span>
                  </div>
                  <p className="correction-reason">{c.reason}</p>
                  {c.reviewNote && (
                    <p className="muted">ملاحظة المراجعة: {c.reviewNote}</p>
                  )}
                  <div className="attendance-row-actions">
                    {c.canReview && (
                      <>
                        <button
                          className="primary"
                          onClick={() => {
                            setDecision({ request: c, decision: "Approved" });
                            setMessage("");
                          }}
                        >
                          اعتماد التصحيح
                        </button>
                        <button
                          onClick={() => {
                            setDecision({ request: c, decision: "Rejected" });
                            setMessage("");
                          }}
                        >
                          رفض التصحيح
                        </button>
                      </>
                    )}
                    {c.canCancel && (
                      <button
                        onClick={() => {
                          setDecision({ request: c, decision: "Cancelled" });
                          setMessage("");
                        }}
                      >
                        سحب الطلب
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="لا توجد طلبات تصحيح"
              description="ابدأ طلبًا من اليوم المطلوب في سجل الحضور."
            />
          )}
          <Pager page={page} setPage={setPage} total={data?.total ?? 0} />
        </State>
      </section>
      {decision && (
        <Modal
          closeLabel="إغلاق النافذة"
          title={
            decision.decision === "Approved"
              ? "اعتماد التصحيح"
              : decision.decision === "Rejected"
                ? "رفض التصحيح"
                : "سحب الطلب"
          }
          subtitle={`${decision.request.fullName} · ${formatDate(decision.request.workDate)}`}
          busy={busy}
          onClose={() => {
            if (!busy) setDecision(null);
          }}
        >
          <form
            className="attendance-modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              try {
                await api(
                  `/attendance/corrections/${decision.request.id}`,
                  "PUT",
                  {
                    decision: decision.decision,
                    note: formValues(e.currentTarget).note,
                    version: decision.request.version,
                  },
                );
                notify("تم تحديث حالة الطلب.");
                setDecision(null);
                onChanged();
              } catch (e) {
                setMessage(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="ملاحظة القرار"
              required={decision.decision === "Rejected"}
            >
              <textarea
                name="note"
                maxLength={500}
                required={decision.decision === "Rejected"}
                rows={3}
              />
            </Field>
            {message && (
              <p className="error" role="alert">
                {message}
              </p>
            )}
            <button className="primary" disabled={busy}>
              تأكيد القرار
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function ScheduleEditor({
  row,
  notify,
  onClose,
  onSaved,
}: {
  row: Row;
  notify: Notice;
  onClose: () => void;
  onSaved: () => void;
}) {
  const setup = useLoad<Setup>("/attendance/setup");
  const [rest, setRest] = useState(row.isRestDay);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      closeLabel="إغلاق النافذة"
      title="تعديل جدول اليوم"
      subtitle={`${row.fullName} · ${formatDate(row.workDate)}`}
      onClose={() => {
        if (!busy) onClose();
      }}
      busy={busy}
    >
      <div className="attendance-modal-form">
        <State error={setup.error} loading={!setup.data && !setup.error}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = formValues(e.currentTarget);
              try {
                await api(`/attendance/schedules/${row.id}`, "PUT", {
                  shiftId: rest ? null : f.shiftId,
                  isRestDay: rest,
                  reason: f.reason,
                  version: row.version,
                });
                notify("تم تحديث الجدول وإعادة حساب نتيجته.");
                onSaved();
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="notice">
              تغيير الجدول يعيد حساب الحضور. لا يسمح بالتغيير عند وجود تصحيح
              معلق أو معتمد.
            </p>
            <label className="check-option">
              <input
                type="checkbox"
                checked={rest}
                onChange={(e) => setRest(e.target.checked)}
              />
              راحة أسبوعية
            </label>
            {!rest && (
              <Field label="شفت اليوم">
                <select required name="shiftId" defaultValue="">
                  <option value="">اختر الشفت</option>
                  {setup.data?.shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="سبب تغيير الجدول" required>
              <textarea required maxLength={500} name="reason" rows={3} />
            </Field>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              حفظ جدول اليوم
            </button>
          </form>
        </State>
      </div>
    </Modal>
  );
}
export function AttendanceSetup({
  user,
  notify,
}: {
  user: User;
  notify: Notice;
}) {
  const [revision, setRevision] = useState(0);
  const { data, error } = useLoad<Setup>("/attendance/setup", revision);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const changed = () => setRevision((v) => v + 1);
  async function save(path: string, body: unknown, method = "POST") {
    setBusy(true);
    setMessage("");
    try {
      await api(path, method, body);
      changed();
      notify("تم حفظ إعداد الحضور.");
      return true;
    } catch (e) {
      setMessage(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <State error={error} loading={!data && !error}>
      {data && (
        <>
          <section className="card">
            <div className="section-heading">
              <div>
                <h2>شفتات العمل</h2>
                <p className="muted">
                  كل تعريف شفت ثابت بعد حفظه لحماية الجداول السابقة. أنشئ
                  تعريفًا جديدًا لتغيير السياسة.
                </p>
              </div>
              <Icon name="calendar" />
            </div>
            {data.shifts.length > 0 && (
              <div className="shift-catalog">
                {data.shifts.map((s) => (
                  <article key={s.id}>
                    <strong>{s.name}</strong>
                    <p className="code">
                      {clockLabel(s.startMinute)} — {clockLabel(s.endMinute)}
                      {s.endsNextDay ? " +1" : ""}
                    </p>
                    <small>
                      {s.endsNextDay ? "ينتهي في اليوم التالي · " : ""}استراحة{" "}
                      {s.breakMinutes} د · سماح دخول {s.arrivalGraceMinutes} د
                    </small>
                  </article>
                ))}
              </div>
            )}
            <details
              className="attendance-details"
              open={data.shifts.length === 0}
            >
              <summary>إضافة تعريف شفت</summary>
              <ShiftForm
                busy={busy}
                onSave={async (body, form) => {
                  if (await save("/attendance/shifts", body)) form.reset();
                }}
              />
            </details>
          </section>
          <ScheduleAssignment shifts={data.shifts} notify={notify} />
          <section className="card">
            <h2>العطلات</h2>
            <p className="muted">
              أدخل عطلات المنشأة المعتمدة؛ لا تُضاف تواريخ نظامية تلقائيًا. تؤثر
              العطلة في جميع الموظفين في تاريخها.
            </p>
            <form
              className="attendance-filter"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                if (await save("/attendance/holidays", formValues(form)))
                  form.reset();
              }}
            >
              <Field label="تاريخ العطلة" required>
                <input type="date" required name="date" />
              </Field>
              <Field label="اسم العطلة" required>
                <input name="name" required maxLength={160} />
              </Field>
              <button className="primary" disabled={busy}>
                إضافة عطلة
              </button>
            </form>
            <div className="holiday-list">
              {data.holidays.map((h) => (
                <div key={h.id}>
                  <span>
                    <strong>{h.name}</strong>
                    <small>{formatDate(h.date)}</small>
                  </span>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        confirm(
                          "حذف العطلة سيعيد حساب نتائج أيامها. هل تريد المتابعة؟",
                        )
                      )
                        await save(
                          `/attendance/holidays/${h.id}?version=${h.version}`,
                          undefined,
                          "DELETE",
                        );
                    }}
                  >
                    حذف العطلة
                  </button>
                </div>
              ))}
            </div>
          </section>
          {hasRole(user, "Administrator") && (
            <section className="card">
              <h2>تسجيل الحضور من البوابة</h2>
              <p>
                يسجل الموظف المرتبط بحساب نشط ضمن نافذة شفته، باستخدام وقت
                الخادم. هذه ميزة تسجيل عن بُعد، ولا تتحقق من الموقع الجغرافي.
              </p>
              <label className="check-option">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={data.policy?.portalEnabled ?? false}
                  onChange={(e) => {
                    if (confirm("تغيير سياسة تسجيل الحضور من البوابة؟"))
                      void save(
                        "/attendance/policy",
                        {
                          portalEnabled: e.target.checked,
                          version: data.policy?.version ?? null,
                        },
                        "PUT",
                      );
                  }}
                />
                السماح بالتسجيل من البوابة
              </label>
            </section>
          )}
          {message && (
            <p className="error" role="alert">
              {message}
            </p>
          )}
        </>
      )}
    </State>
  );
}
function ShiftForm({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (body: unknown, form: HTMLFormElement) => Promise<void>;
}) {
  const mins = (s: string) =>
    Number(s.split(":")[0]) * 60 + Number(s.split(":")[1]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = formValues(e.currentTarget);
        void onSave(
          {
            name: f.name,
            startMinute: mins(f.start),
            endMinute: mins(f.end),
            endsNextDay: f.next === "on",
            breakOffsetMinutes: Number(f.breakOffsetMinutes),
            breakMinutes: Number(f.breakMinutes),
            arrivalGraceMinutes: Number(f.arrivalGraceMinutes),
            departureGraceMinutes: Number(f.departureGraceMinutes),
            captureBeforeMinutes: Number(f.captureBeforeMinutes),
            captureAfterMinutes: Number(f.captureAfterMinutes),
          },
          e.currentTarget,
        );
      }}
    >
      <div className="form-grid">
        <Field label="اسم الشفت" required>
          <input
            required
            name="name"
            maxLength={100}
            placeholder="مثل: صباحي — الإدارة"
          />
        </Field>
        <Field label="بداية الشفت" required>
          <input required type="time" name="start" defaultValue="08:00" />
        </Field>
        <Field label="نهاية الشفت" required>
          <input required type="time" name="end" defaultValue="16:00" />
        </Field>
        <label className="check-option">
          <input name="next" type="checkbox" />
          ينتهي في اليوم التالي
        </label>
        {[
          ["breakMinutes", "مدة الاستراحة غير المدفوعة", 0, 180],
          [
            "breakOffsetMinutes",
            "بداية الاستراحة بعد بداية الشفت بالدقائق",
            240,
            960,
          ],
          ["arrivalGraceMinutes", "سماح الوصول بالدقائق", 0, 120],
          ["departureGraceMinutes", "سماح الانصراف بالدقائق", 0, 120],
          [
            "captureBeforeMinutes",
            "استقبال البصمات قبل بداية الشفت بالدقائق",
            60,
            120,
          ],
          [
            "captureAfterMinutes",
            "استقبال البصمات بعد نهاية الشفت بالدقائق",
            120,
            240,
          ],
        ].map(([name, label, value, max]) => (
          <Field key={String(name)} label={String(label)}>
            <input
              name={String(name)}
              type="number"
              min="0"
              max={Number(max)}
              required
              defaultValue={Number(value)}
            />
          </Field>
        ))}
      </div>
      <p className="muted">
        السماح يُخصم من دقائق التأخير والانصراف المبكر. مدة الشفت حتى 16 ساعة،
        والاستراحة داخله.
      </p>
      <button className="primary" disabled={busy}>
        حفظ تعريف الشفت
      </button>
    </form>
  );
}
function ScheduleAssignment({
  shifts,
  notify,
}: {
  shifts: Shift[];
  notify: Notice;
}) {
  const [q, setQ] = useState("");
  const query = useDebouncedValue(q);
  const people = useLoad<Page<Employee>>(
    `/employees?q=${encodeURIComponent(query)}&status=Active&pageSize=100`,
  );
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [days, setDays] = useState([0, 1, 2, 3, 4]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = formValues(e.currentTarget);
    try {
      const r = await api<{ created: number }>(
        "/attendance/schedules",
        "POST",
        {
          from: f.from,
          to: f.to,
          shiftId: f.shiftId,
          employeeIds: Object.keys(selected),
          workDaysMask: days.reduce((sum, d) => sum | (1 << d), 0),
        },
      );
      notify(`تم إنشاء ${r.created} يومًا مجدولًا.`);
      setSelected({});
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>توزيع الجداول</h2>
      <p className="muted">
        أنشئ حتى 31 يومًا لـ100 موظف في الدفعة. الأيام غير المحددة تُسجل راحة
        أسبوعية. يمكن تغيير شفت يوم معين من تقرير الحضور.
      </p>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="الشفت المطلوب" required>
            <select required name="shiftId">
              <option value="">اختر الشفت</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="بداية فترة الجدول" required>
            <input required name="from" type="date" />
          </Field>
          <Field label="نهاية فترة الجدول" required>
            <input required name="to" type="date" />
          </Field>
        </div>
        <fieldset className="workdays">
          <legend>أيام العمل</legend>
          {[
            "الأحد",
            "الإثنين",
            "الثلاثاء",
            "الأربعاء",
            "الخميس",
            "الجمعة",
            "السبت",
          ].map((day, i) => (
            <label key={day} className="check-option">
              <input
                type="checkbox"
                checked={days.includes(i)}
                onChange={(e) =>
                  setDays((current) =>
                    e.target.checked
                      ? [...current, i]
                      : current.filter((d) => d !== i),
                  )
                }
              />
              {day}
            </label>
          ))}
        </fieldset>
        <Field label="بحث الموظفين للجدول">
          <input
            value={q}
            maxLength={160}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث بالاسم أو الرقم"
          />
        </Field>
        <div className="selection-summary">
          <strong>{Object.keys(selected).length} موظف محدد</strong>
          <button
            type="button"
            onClick={() =>
              setSelected(
                Object.fromEntries(
                  (people.data?.items ?? []).map((e) => [
                    e.id,
                    `${e.number} — ${e.fullName}`,
                  ]),
                ),
              )
            }
          >
            تحديد نتائج البحث المعروضة
          </button>
          <button type="button" onClick={() => setSelected({})}>
            مسح التحديد
          </button>
        </div>
        <State error={people.error} loading={!people.data && !people.error}>
          <div className="employee-checks">
            {people.data?.items.map((e) => (
              <label key={e.id} className="check-option">
                <input
                  type="checkbox"
                  checked={!!selected[e.id]}
                  onChange={(event) =>
                    setSelected((old) => {
                      const next = { ...old };
                      if (event.target.checked)
                        next[e.id] = `${e.number} — ${e.fullName}`;
                      else delete next[e.id];
                      return next;
                    })
                  }
                />
                <span>
                  {e.fullName}
                  <small className="code">{e.number}</small>
                </span>
              </label>
            ))}
          </div>
          {people.data && people.data.total > 100 && (
            <p className="muted">
              تظهر أول 100 نتيجة؛ ابحث لتحديد موظفين إضافيين ضمن حد الدفعة.
            </p>
          )}
        </State>
        {Object.keys(selected).length > 0 && (
          <details>
            <summary>مراجعة الموظفين المحددين</summary>
            <p>{Object.values(selected).join("، ")}</p>
          </details>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary"
          disabled={
            busy ||
            !Object.keys(selected).length ||
            Object.keys(selected).length > 100 ||
            days.length === 0 ||
            shifts.length === 0
          }
        >
          {busy ? "جارٍ إنشاء الجداول…" : "إنشاء الجداول"}
        </button>
      </form>
    </section>
  );
}
export function AttendanceImportPage({ notify }: { notify: Notice }) {
  const [file, setFile] = useState<File>();
  const [rows, setRows] = useState<
    {
      row: number;
      number: string;
      fullName: string | null;
      occurredAtUtc: string | null;
      kind: string;
      duplicate: boolean;
      error: string | null;
    }[]
  >();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  async function run(commit: boolean) {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    const data = new FormData();
    data.append("file", file);
    try {
      if (commit) {
        const r = await api<{ inserted: number; duplicates: number }>(
          "/attendance/import/commit",
          "POST",
          data,
        );
        notify(`تم حفظ ${r.inserted} حركة، وتجاهل ${r.duplicates} حركة مكررة.`);
        setRows(undefined);
        setFile(undefined);
        if (ref.current) ref.current.value = "";
      } else setRows(await api("/attendance/import/preview", "POST", data));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <h2>استيراد حركات الحضور</h2>
          <p className="muted">
            معاينة كاملة قبل الحفظ، مع حفظ الحركات الأصلية ومنع تكرار الموظف
            والوقت والنوع.
          </p>
        </div>
        <a className="button" href="/api/attendance/import/template">
          <Icon name="file" />
          تنزيل قالب الحركات
        </a>
      </div>
      <ol className="import-instructions">
        <li>EmployeeNumber: الرقم الوظيفي الموجود في دليل الموظفين.</li>
        <li>
          Timestamp: وقت الحركة مع فرق المنطقة، مثل{" "}
          <code dir="ltr">2026-10-18T08:00:00+03:00</code>.
        </li>
        <li>
          Kind: <code>In</code> للدخول أو <code>Out</code> للخروج. الحد 2000
          حركة و2 MB.
        </li>
      </ol>
      <Field label="ملف حركات الحضور">
        <input
          ref={ref}
          disabled={busy}
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            setFile(e.target.files?.[0]);
            setRows(undefined);
            setError("");
          }}
        />
      </Field>
      <button disabled={!file || busy} onClick={() => run(false)}>
        <Icon name="search" />
        معاينة الحركات
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {rows && (
        <>
          <div className="attendance-kpis">
            <div>
              <span>حركات جديدة</span>
              <strong>
                {rows.filter((r) => !r.duplicate && !r.error).length}
              </strong>
            </div>
            <div>
              <span>مكررة ستُتجاهل</span>
              <strong>{rows.filter((r) => r.duplicate).length}</strong>
            </div>
            <div>
              <span>أخطاء تمنع الحفظ</span>
              <strong>{rows.filter((r) => r.error).length}</strong>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>الصف</th>
                  <th>الموظف</th>
                  <th>الوقت UTC</th>
                  <th>النوع</th>
                  <th>نتيجة الفحص</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td>
                      {r.number}
                      <small>{r.fullName}</small>
                    </td>
                    <td className="code">{r.occurredAtUtc ?? "—"}</td>
                    <td>{r.kind}</td>
                    <td>
                      {r.error ??
                        (r.duplicate ? "مكررة — ستتجاهل" : "جاهزة للحفظ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            الحفظ يعيد فحص الملف على الخادم، ولا يحفظ أي صف عند وجود خطأ.
          </p>
          <button
            className="primary"
            disabled={
              busy || rows.some((r) => r.error !== null) || !rows.length
            }
            onClick={() => run(true)}
          >
            حفظ الحركات
          </button>
        </>
      )}
    </section>
  );
}
