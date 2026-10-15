import { useState, type FormEvent } from "react";
import { api, formValues } from "../api";
import { roles } from "../i18n";
import { useLoad } from "../hooks";
import {
  date,
  errorText,
  activityLabel,
  type Structure,
  type Org,
  type Notice,
  type Page,
} from "../model";
import { Field, State, Pager } from "../ui";
import { SearchPicker } from "./SearchPicker";
export function Organization({
  admin,
  notify,
}: {
  admin: boolean;
  notify: Notice;
}) {
  const [rev, setRev] = useState(0);
  const { data: org, error: orgError } = useLoad<Org | null>(
    "/organization",
    rev,
  );
  const { data, error } = useLoad<Structure>("/structure", rev);
  const [busy, setBusy] = useState(false);
  async function save(
    e: FormEvent<HTMLFormElement>,
    path: string,
    method = "POST",
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    const x = formValues(form);
    setBusy(true);
    try {
      await api(
        path,
        path === "/organization" ? "PUT" : method,
        path === "/organization"
          ? { ...x, version: org?.version ?? null }
          : { ...x, parentId: x.parentId || null },
      );
      notify("تم الحفظ.");
      form.reset();
      setRev((r) => r + 1);
    } catch (e) {
      notify(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <State error={orgError} loading={org === undefined}>
        {admin ? (
          <form
            className="card"
            onSubmit={(e) => save(e, "/organization")}
            key={org?.version}
          >
            <h2>إعداد المنشأة</h2>
            <div className="form-grid">
              <Field label="اسم المنشأة">
                <input
                  required
                  name="name"
                  maxLength={160}
                  defaultValue={org?.name ?? "HR Platform"}
                />
              </Field>
              <Field label="المنطقة الزمنية">
                <input
                  required
                  name="timeZone"
                  defaultValue={org?.timeZone ?? "Asia/Riyadh"}
                />
              </Field>
            </div>
            <button className="primary" disabled={busy}>
              حفظ إعداد المنشأة
            </button>
          </form>
        ) : (
          <div className="card">
            <h2>{org?.name ?? "لم تُعد المنشأة بعد"}</h2>
            <p>{org?.timeZone}</p>
          </div>
        )}
      </State>
      <State error={error} loading={!data}>
        <div className="three-columns">
          {(["branches", "departments", "jobs"] as const).map((kind, i) => (
            <section className="card" key={kind}>
              <h2>{["الفروع", "الأقسام", "الوظائف"][i]}</h2>
              <ul className="unit-list">
                {data?.[kind].map((x) => (
                  <li key={x.id}>
                    <strong>{x.name}</strong>
                    <small>
                      {kind === "departments"
                        ? data.branches.find((p) => p.id === x.branchId)?.name
                        : kind === "jobs"
                          ? data.departments.find(
                              (p) => p.id === x.departmentId,
                            )?.name
                          : ""}
                    </small>
                    <details>
                      <summary>تعديل الاسم</summary>
                      <form
                        onSubmit={(e) => save(e, `/${kind}/${x.id}`, "PUT")}
                      >
                        <input type="hidden" name="version" value={x.version} />
                        <Field label="الاسم الجديد">
                          <input
                            required
                            name="name"
                            defaultValue={x.name}
                            maxLength={160}
                          />
                        </Field>
                        <button disabled={busy}>حفظ الاسم</button>
                      </form>
                    </details>
                  </li>
                ))}
              </ul>
              {!data?.[kind].length && (
                <p className="muted">لا توجد سجلات بعد.</p>
              )}
              <form onSubmit={(e) => save(e, `/${kind}`)}>
                <Field label="الاسم">
                  <input name="name" required maxLength={160} />
                </Field>
                {i > 0 && (
                  <Field label={i === 1 ? "الفرع" : "القسم"}>
                    <select required name="parentId">
                      <option value="">اختر</option>
                      {(i === 1 ? data?.branches : data?.departments)?.map(
                        (x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                )}
                <button disabled={busy}>
                  إضافة {["فرع", "قسم", "وظيفة"][i]}
                </button>
              </form>
            </section>
          ))}
        </div>
      </State>
    </>
  );
}
export function Attachments({
  employee,
  canEdit,
}: {
  employee: string;
  canEdit: boolean;
}) {
  const [rev, setRev] = useState(0);
  const [error, setError] = useState("");
  const { data, error: loadError } = useLoad<
    { id: string; fileName: string; size: number }[]
  >(`/employees/${employee}/attachments`, rev);
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      await api(
        `/employees/${employee}/attachments`,
        "POST",
        new FormData(form),
      );
      setRev((x) => x + 1);
      form.reset();
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <section className="attachments">
      <h3>المرفقات الخاصة</h3>
      <State error={loadError} loading={!data}>
        <ul>
          {data?.map((x) => (
            <li key={x.id}>
              <a href={`/api/employees/${employee}/attachments/${x.id}`}>
                {x.fileName}
              </a>{" "}
              · {Math.ceil(x.size / 1024)} KB
            </li>
          ))}
        </ul>
        {data?.length === 0 && <p className="muted">لا توجد مرفقات.</p>}
      </State>
      {canEdit && (
        <form onSubmit={upload}>
          <Field label="ملف PDF أو صورة (حتى 5 MB)">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              name="file"
              required
            />
          </Field>
          <button>رفع المرفق</button>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
type ImportRow = {
  row: number;
  error: string | null;
  employee: { number: string; fullName: string } | null;
};
export function ImportEmployees({ notify }: { notify: Notice }) {
  const [file, setFile] = useState<File>();
  const [rows, setRows] = useState<ImportRow[]>();
  const [busy, setBusy] = useState(false);
  async function run(commit: boolean) {
    if (!file) return;
    setBusy(true);
    const f = new FormData();
    f.append("file", file);
    try {
      if (commit) {
        const x = await api<{ count: number }>(
          "/import/employees/commit",
          "POST",
          f,
        );
        notify(`تم استيراد ${x.count} موظف.`);
        setRows(undefined);
        setFile(undefined);
      } else
        setRows(await api<ImportRow[]>("/import/employees/preview", "POST", f));
    } catch (e) {
      notify(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>استيراد من Excel</h2>
      <p>
        نزّل القالب، وأدخل معرف الوظيفة من القائمة أدناه. التاريخ بصيغة
        YYYY-MM-DD. الحد 2000 موظف و2 MB. الحفظ يعيد التحقق من الملف كاملًا، ولا
        يحفظ أي صف عند وجود خطأ.
      </p>
      <a href="/api/import/employees/template" className="button">
        تنزيل القالب
      </a>
      <JobIds />
      <Field label="ملف الموظفين">
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            setFile(e.target.files?.[0]);
            setRows(undefined);
          }}
        />
      </Field>
      <button disabled={!file || busy} onClick={() => run(false)}>
        معاينة وفحص الأخطاء
      </button>
      {rows && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>الصف</th>
                  <th>الرقم</th>
                  <th>الاسم</th>
                  <th>النتيجة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.row}>
                    <td>{x.row}</td>
                    <td>{x.employee?.number}</td>
                    <td>{x.employee?.fullName}</td>
                    <td className={x.error ? "error" : ""}>
                      {x.error ?? "صالح"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="primary"
            disabled={
              busy || rows.some((x) => x.error !== null) || rows.length === 0
            }
            onClick={() => run(true)}
          >
            حفظ {rows.length} موظف
          </button>
        </>
      )}
    </section>
  );
}
function JobIds() {
  const { data } = useLoad<Structure>("/structure");
  return (
    <details>
      <summary>معرفات الوظائف للقالب</summary>
      {data?.jobs.map((x) => (
        <p key={x.id}>
          {x.name}: <code>{x.id}</code>
        </p>
      ))}
    </details>
  );
}
type Account = {
  id: string;
  email: string;
  roles: string[];
  isActive: boolean;
  employeeId: string | null;
};
export function Users({ notify }: { notify: Notice }) {
  const [rev, setRev] = useState(0);
  const [page, setPage] = useState(1);
  const { data, error } = useLoad<Page<Account>>(`/users?page=${page}`, rev);
  const [busy, setBusy] = useState(false);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = formValues(form);
    setBusy(true);
    try {
      await api("/users", "POST", { ...f, employeeId: f.employeeId || null });
      form.reset();
      setRev((x) => x + 1);
      notify("تم إنشاء الحساب.");
    } catch (e) {
      notify(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form className="card" onSubmit={create}>
        <h2>إنشاء حساب</h2>
        <div className="form-grid">
          <Field label="البريد الإلكتروني">
            <input type="email" name="email" required maxLength={254} />
          </Field>
          <Field label="كلمة مرور أولية قوية">
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={256}
            />
          </Field>
          <Field label="الدور">
            <select name="role" defaultValue="Employee">
              {Object.entries(roles).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <SearchPicker label="الموظف المرتبط" name="employeeId" />
        </div>
        <p className="muted">
          دور واحد للحساب. الموظف والمدير يتطلبان ملف موظف مرتبطًا. يفضل تسليم
          كلمة المرور عبر قناة آمنة.
        </p>
        <button disabled={busy} className="primary">
          إنشاء الحساب
        </button>
      </form>
      <div className="card">
        <State error={error} loading={!data}>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>الحساب</th>
                  <th>الصلاحية</th>
                  <th>الحالة</th>
                  <th>تغيير الدور</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.roles.map((x) => roles[x]).join("، ")}</td>
                    <td>
                      <span>{u.isActive ? "نشط" : "معطل"}</span>
                      <button
                        onClick={async () => {
                          try {
                            await api(`/users/${u.id}/active`, "PUT", {
                              isActive: !u.isActive,
                            });
                            setRev((x) => x + 1);
                            notify(
                              u.isActive
                                ? "تم تعطيل الحساب وإبطال جلساته."
                                : "تم تفعيل الحساب.",
                            );
                          } catch (e) {
                            notify(errorText(e), "error");
                          }
                        }}
                      >
                        {u.isActive ? "تعطيل" : "تفعيل"}
                      </button>
                    </td>
                    <td>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            await api(
                              `/users/${u.id}/role`,
                              "PUT",
                              formValues(e.currentTarget),
                            );
                            setRev((x) => x + 1);
                            notify("تم تغيير الدور وإبطال الجلسات السابقة.");
                          } catch (e) {
                            notify(errorText(e), "error");
                          }
                        }}
                      >
                        <select
                          name="role"
                          defaultValue={u.roles[0]}
                          aria-label={`دور ${u.email}`}
                        >
                          {Object.entries(roles).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <button>تطبيق</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} setPage={setPage} total={data?.total ?? 0} />
        </State>
      </div>
    </>
  );
}
export function Audit() {
  const [page, setPage] = useState(1);
  const { data, error } = useLoad<
    Page<{
      id: number;
      occurredAt: string;
      actorId: string;
      actorName: string;
      action: string;
      entityId: string;
    }>
  >(`/audit?page=${page}`);
  return (
    <div className="card">
      <State error={error} loading={!data}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>التوقيت</th>
                <th>العملية</th>
                <th>الحساب</th>
                <th>السجل</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((x) => (
                <tr key={x.id}>
                  <td>
                    {new Date(x.occurredAt).toLocaleString("ar-SA", {
                      timeZone: "Asia/Riyadh",
                    })}
                  </td>
                  <td>{activityLabel(x.action)}</td>
                  <td>{x.actorName}</td>
                  <td className="mono">{x.entityId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>
            {data?.total ?? 0} عملية · صفحة {page}
          </span>
          <button disabled={page === 1} onClick={() => setPage((x) => x - 1)}>
            السابق
          </button>
          <button
            disabled={page * 50 >= (data?.total ?? 0)}
            onClick={() => setPage((x) => x + 1)}
          >
            التالي
          </button>
        </div>
      </State>
    </div>
  );
}
type FinancialData = {
  version: string;
  baseSalary: string;
  bank: string;
  iban: string;
  effectiveFrom: string;
};
export function PasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = formValues(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await api("/auth/password", "POST", f);
          onSuccess();
        } catch (e) {
          setError(errorText(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>تغيير كلمة المرور</h2>
      <p className="muted">
        تُنهى جميع جلسات الحساب بعد التغيير. سجل الدخول بكلمة المرور الجديدة.
      </p>
      <div className="form-grid">
        <Field label="كلمة المرور الحالية">
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            required
            maxLength={256}
          />
        </Field>
        <Field label="كلمة المرور الجديدة">
          <input
            type="password"
            name="newPassword"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={256}
          />
        </Field>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        تغيير كلمة المرور وإنهاء الجلسات
      </button>
    </form>
  );
}
export function Financial({ notify }: { notify: Notice }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [id, setId] = useState("");
  const { data, error } = useLoad<
    Page<{ id: string; number: string; fullName: string }>
  >(`/financial/employees?q=${encodeURIComponent(q)}&page=${page}`);
  return (
    <>
      <p className="notice">
        هذه بيانات الراتب الأساسية الحالية، وليست مسير رواتب أو كشف راتب. حفظ
        التاريخ لا ينفذ احتسابًا بأثر رجعي.
      </p>
      <div className="toolbar">
        <input
          aria-label="بحث البيانات المالية"
          placeholder="ابحث عن الموظف"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="card">
        <State error={error} loading={!data}>
          {data?.items.map((x) => (
            <button
              className="employee-choice"
              key={x.id}
              onClick={() => setId(x.id)}
            >
              {x.number} — {x.fullName}
            </button>
          ))}
          {data?.items.length === 0 && <p>لا توجد سجلات.</p>}
          <Pager page={page} setPage={setPage} total={data?.total ?? 0} />
        </State>
      </div>
      {id && <FinancialForm key={id} id={id} notify={notify} />}
    </>
  );
}
function FinancialForm({ id, notify }: { id: string; notify: Notice }) {
  const [rev, setRev] = useState(0);
  const { data, error } = useLoad<FinancialData | null>(
    `/employees/${id}/financial`,
    rev,
  );
  const [busy, setBusy] = useState(false);
  return (
    <State error={error} loading={data === undefined}>
      <form
        key={data?.version}
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = formValues(e.currentTarget);
          setBusy(true);
          try {
            await api(`/employees/${id}/financial`, "PUT", {
              ...f,
              version: data?.version ?? null,
            });
            setRev((x) => x + 1);
            notify("تم حفظ البيانات المالية.");
          } catch (e) {
            notify(errorText(e), "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>بيانات مالية مقيدة</h2>
        <div className="form-grid">
          <Field label="الراتب الأساسي (ريال)">
            <input
              name="baseSalary"
              inputMode="decimal"
              pattern="[0-9]+([.][0-9]{1,2})?"
              required
              defaultValue={data?.baseSalary ?? "0.00"}
            />
          </Field>
          <Field label="تاريخ السريان">
            <input
              name="effectiveFrom"
              type="date"
              required
              defaultValue={data?.effectiveFrom ?? date()}
            />
          </Field>
          <Field label="البنك">
            <input name="bank" maxLength={120} defaultValue={data?.bank} />
          </Field>
          <Field label="IBAN سعودي">
            <input
              name="iban"
              dir="ltr"
              maxLength={30}
              defaultValue={data?.iban}
            />
          </Field>
        </div>
        <button disabled={busy} className="primary">
          حفظ البيانات المالية
        </button>
      </form>
    </State>
  );
}
