import { useEffect, useState, type FormEvent } from "react";
import { api, formValues } from "../api";
import { useDebouncedValue, useLoad } from "../hooks";
import {
  date,
  errorText,
  formatDate,
  type Employee,
  type Navigate,
  type Notice,
  type Page,
  type Structure,
} from "../model";
import { Avatar, Empty, Field, Icon, Modal, Pager, State, Status } from "../ui";
import { Attachments } from "./FoundationPages";
import { SearchPicker } from "./SearchPicker";

export function Employees({
  canEdit,
  notify,
  detail,
  onNavigate,
  initialSearch = "",
  timeZone = "Asia/Riyadh",
}: {
  canEdit: boolean;
  notify: Notice;
  detail: string;
  onNavigate: Navigate;
  initialSearch?: string;
  timeZone?: string;
}) {
  const [q, setQ] = useState(initialSearch);
  const [status, setStatus] = useState("");
  const [branch, setBranch] = useState("");
  const [department, setDepartment] = useState("");
  const [sort, setSort] = useState("number");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const search = useDebouncedValue(q);
  const structure = useLoad<Structure>(canEdit ? "/structure" : null, revision);
  const { data, error, loading } = useLoad<Page<Employee>>(
    `/employees?q=${encodeURIComponent(search)}&status=${status}${branch ? "&branchId=" + branch : ""}${department ? "&departmentId=" + department : ""}&sort=${sort}&page=${page}`,
    revision,
  );
  useEffect(() => {
    setQ(initialSearch);
    setPage(1);
  }, [initialSearch]);
  const activeFilters = !!(q || status || branch || department);
  function reset() {
    setQ("");
    setStatus("");
    setBranch("");
    setDepartment("");
    setPage(1);
  }
  const validId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(detail);
  return (
    <>
      <section className="card employees-panel no-padding">
        <div className="section-heading panel-heading">
          <div>
            <h2>
              دليل الموظفين{" "}
              <span className="count-badge">{data?.total ?? "—"}</span>
            </h2>
            <p className="muted">ملفات منظمة ومعلومات يسهل الوصول إليها.</p>
          </div>
          {canEdit && (
            <button
              className="primary"
              aria-label="+ إضافة موظف"
              onClick={() => onNavigate("employees", "new")}
            >
              <Icon name="plus" size={18} />
              إضافة موظف
            </button>
          )}
        </div>
        <div className="employee-filters">
          <div className="search-box">
            <Icon name="search" size={19} />
            <input
              aria-label="بحث الموظفين"
              placeholder="ابحث بالاسم أو الرقم الوظيفي…"
              maxLength={160}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            {q && (
              <button
                type="button"
                className="icon-button"
                aria-label="مسح البحث"
                onClick={() => {
                  setQ("");
                  setPage(1);
                }}
              >
                <Icon name="close" size={15} />
              </button>
            )}
          </div>
          <select
            aria-label="الحالة"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">جميع الحالات</option>
            <option value="Active">نشط</option>
            <option value="Inactive">غير نشط</option>
            <option value="Terminated">منتهي الخدمة</option>
          </select>
          {canEdit && (
            <>
              <select
                aria-label="تصفية الفرع"
                value={branch}
                onChange={(e) => {
                  setBranch(e.target.value);
                  setDepartment("");
                  setPage(1);
                }}
              >
                <option value="">جميع الفروع</option>
                {structure.data?.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="تصفية القسم"
                value={department}
                onChange={(e) => {
                  setDepartment(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">جميع الأقسام</option>
                {structure.data?.departments
                  .filter((d) => !branch || d.branchId === branch)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </>
          )}
          <select
            aria-label="ترتيب الموظفين"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="number">الرقم الوظيفي</option>
            <option value="name">الاسم: أ–ي</option>
            <option value="newest">الأحدث انضمامًا</option>
          </select>
          {activeFilters && (
            <button className="text-button clear-filters" onClick={reset}>
              <Icon name="close" size={14} />
              مسح الفلاتر
            </button>
          )}
        </div>
        {structure.error && (
          <div className="inline-warning">
            تعذر تحميل فلاتر الهيكل؛ يمكنك متابعة البحث والحالة.
          </div>
        )}
        <State error={error} loading={!data && !error}>
          <div
            className={`employee-results ${loading ? "is-loading" : ""}`}
            aria-busy={loading}
          >
            {data?.items.length ? (
              <>
                <div className="table-scroll desktop-employees">
                  <table>
                    <thead>
                      <tr>
                        <th>الموظف</th>
                        <th>الوظيفة والقسم</th>
                        <th>الفرع</th>
                        <th>تاريخ الالتحاق</th>
                        <th>الحالة</th>
                        <th>
                          <span className="sr-only">الإجراءات</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((e) => (
                        <tr key={e.id}>
                          <td>
                            <div className="table-person">
                              <Avatar name={e.fullName} />
                              <div>
                                <strong>{e.fullName}</strong>
                                <small className="code">{e.number}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <strong>{e.jobTitle ?? "—"}</strong>
                            <small>{e.department ?? "—"}</small>
                          </td>
                          <td>{e.branch ?? "—"}</td>
                          <td>{formatDate(e.joinDate)}</td>
                          <td>
                            <Status value={e.status} />
                          </td>
                          <td>
                            <button
                              className="row-open"
                              aria-label={`فتح ملف ${e.fullName}`}
                              onClick={() => onNavigate("employees", e.id)}
                            >
                              <Icon name="eye" size={17} />
                              <span>عرض الملف</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mobile-employees">
                  {data.items.map((e) => (
                    <article className="mobile-employee" key={e.id}>
                      <div className="table-person">
                        <Avatar name={e.fullName} />
                        <div>
                          <strong>{e.fullName}</strong>
                          <small className="code">{e.number}</small>
                        </div>
                        <Status value={e.status} />
                      </div>
                      <p>
                        {e.jobTitle ?? "—"}
                        <span>·</span>
                        {e.department ?? "—"}
                      </p>
                      <div className="mobile-employee-bottom">
                        <span>
                          <Icon name="building" size={14} />
                          {e.branch ?? "—"}
                        </span>
                        <button
                          className="text-button"
                          aria-label={`فتح ملف ${e.fullName} على الجوال`}
                          onClick={() => onNavigate("employees", e.id)}
                        >
                          عرض الملف
                          <Icon name="arrow" size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <Empty
                title={
                  activeFilters ? "لا توجد نتائج مطابقة" : "لنبدأ بأول موظف"
                }
                description={
                  activeFilters
                    ? "جرّب تغيير كلمات البحث أو الفلاتر."
                    : "جهّز الهيكل التنظيمي، ثم أضف ملفات الموظفين هنا."
                }
                action={
                  activeFilters ? (
                    <button onClick={reset}>مسح الفلاتر</button>
                  ) : canEdit ? (
                    <button onClick={() => onNavigate("organization")}>
                      إعداد الهيكل التنظيمي
                    </button>
                  ) : undefined
                }
              />
            )}
            <Pager page={page} setPage={setPage} total={data?.total ?? 0} />
          </div>
        </State>
        {error && (
          <button
            className="text-button retry-button"
            onClick={() => setRevision((x) => x + 1)}
          >
            إعادة المحاولة
          </button>
        )}
      </section>
      {((detail === "new" && canEdit) || validId) && (
        <EmployeeDialog
          key={detail}
          id={validId ? detail : null}
          canEdit={canEdit}
          notify={notify}
          timeZone={timeZone}
          onClose={() => onNavigate("employees")}
          onSaved={() => {
            setRevision((x) => x + 1);
            onNavigate("employees");
          }}
        />
      )}
    </>
  );
}
function EmployeeDialog({
  id,
  canEdit,
  notify,
  onClose,
  onSaved,
  timeZone,
}: {
  id: string | null;
  canEdit: boolean;
  notify: Notice;
  onClose: () => void;
  onSaved: () => void;
  timeZone: string;
}) {
  const { data, error } = useLoad<Employee>(id ? `/employees/${id}` : null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("details");
  function close() {
    if (
      !busy &&
      (!dirty ||
        window.confirm(
          "لديك تغييرات غير محفوظة. هل تريد إغلاق الملف دون حفظها؟",
        ))
    )
      onClose();
  }
  return (
    <Modal
      title={id ? (data?.fullName ?? "ملف الموظف") : "إضافة موظف جديد"}
      subtitle={
        id
          ? "ملف وظيفي ومرفقات خاصة"
          : "أدخل البيانات الأساسية والوظيفية لإنشاء الملف."
      }
      onClose={close}
      busy={busy}
    >
      <State error={error} loading={!!id && !data && !error}>
        {(!id || data) && (
          <>
            <div className="profile-banner">
              <Avatar name={data?.fullName ?? "موظف جديد"} size="large" />
              <div>
                <strong>{data?.fullName ?? "ملف جديد لفريقك"}</strong>
                <p>
                  {data
                    ? `${data.jobTitle ?? "موظف"} · ${data.department ?? ""}`
                    : "بيانات دقيقة من البداية تسهّل إدارة الفريق."}
                </p>
                {data && <span className="code">{data.number}</span>}
              </div>
              {data && <Status value={data.status} />}
            </div>
            {id && (canEdit || data?.canReadAttachments) && (
              <div
                className="profile-tabs"
                role="tablist"
                aria-label="أقسام ملف الموظف"
              >
                <button
                  role="tab"
                  id="employee-details-tab"
                  aria-selected={tab === "details"}
                  aria-controls="employee-details-panel"
                  onClick={() => setTab("details")}
                >
                  <Icon name="briefcase" size={17} />
                  البيانات الوظيفية
                </button>
                <button
                  role="tab"
                  id="employee-files-tab"
                  aria-selected={tab === "files"}
                  aria-controls="employee-files-panel"
                  onClick={() => setTab("files")}
                >
                  <Icon name="file" size={17} />
                  المرفقات الخاصة
                </button>
              </div>
            )}
            <div
              id="employee-details-panel"
              role={id ? "tabpanel" : undefined}
              aria-labelledby={id ? "employee-details-tab" : undefined}
              hidden={tab !== "details"}
            >
              {canEdit ? (
                <EmployeeForm
                  initial={data ?? null}
                  timeZone={timeZone}
                  onDirty={() => setDirty(true)}
                  onBusy={setBusy}
                  notify={notify}
                  onSave={onSaved}
                />
              ) : (
                data && (
                  <dl className="profile-readonly">
                    <div>
                      <dt>الرقم الوظيفي</dt>
                      <dd className="code">{data.number}</dd>
                    </div>
                    <div>
                      <dt>تاريخ الالتحاق</dt>
                      <dd>{formatDate(data.joinDate)}</dd>
                    </div>
                    <div>
                      <dt>البريد الإلكتروني</dt>
                      <dd>{data.email || "—"}</dd>
                    </div>
                    <div>
                      <dt>الهاتف</dt>
                      <dd>{data.phone || "—"}</dd>
                    </div>
                    <div>
                      <dt>الفرع</dt>
                      <dd>{data.branch ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>القسم</dt>
                      <dd>{data.department ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>المدير المباشر</dt>
                      <dd>{data.managerName ?? "غير محدد"}</dd>
                    </div>
                    <div>
                      <dt>نوع العقد</dt>
                      <dd>
                        {data.contractType === "FixedTerm"
                          ? "محدد المدة"
                          : "غير محدد المدة"}
                      </dd>
                    </div>
                  </dl>
                )
              )}
            </div>
            {id && (canEdit || data?.canReadAttachments) && (
              <div
                id="employee-files-panel"
                role="tabpanel"
                aria-labelledby="employee-files-tab"
                hidden={tab !== "files"}
              >
                <Attachments employee={id} canEdit={canEdit} />
              </div>
            )}
          </>
        )}
      </State>
    </Modal>
  );
}
function EmployeeForm({
  initial,
  notify,
  onSave,
  onDirty,
  onBusy,
  timeZone,
}: {
  initial: Employee | null;
  notify: Notice;
  onSave: () => void;
  onDirty: () => void;
  onBusy: (busy: boolean) => void;
  timeZone: string;
}) {
  const { data, error } = useLoad<Structure>("/structure");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    onBusy(true);
    setMessage("");
    const f = formValues(e.currentTarget);
    try {
      await api(
        `/employees${initial ? "/" + initial.id : ""}`,
        initial ? "PUT" : "POST",
        {
          ...f,
          managerId: f.managerId || null,
          version: initial?.version ?? null,
        },
      );
      notify("تم حفظ ملف الموظف.");
      onSave();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  const defaultDate = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return (
    <State error={error} loading={!data && !error}>
      <form onSubmit={submit} onChange={onDirty} className="employee-form">
        <fieldset>
          <legend>
            <span>01</span>البيانات الأساسية
          </legend>
          <div className="form-grid">
            <Field
              label="الرقم الوظيفي"
              required
              help="أحرف إنجليزية وأرقام وشرطة، دون مسافات."
            >
              <input
                name="number"
                required
                maxLength={30}
                defaultValue={initial?.number}
                placeholder="مثل EMP001"
                dir="ltr"
              />
            </Field>
            <Field label="الاسم الكامل" required>
              <input
                name="fullName"
                required
                maxLength={160}
                defaultValue={initial?.fullName}
                placeholder="اسم الموظف كما يظهر في ملفه"
              />
            </Field>
            <Field label="البريد الإلكتروني">
              <input
                name="email"
                type="email"
                maxLength={254}
                defaultValue={initial?.email}
                placeholder="name@company.com"
                dir="ltr"
              />
            </Field>
            <Field label="رقم الهاتف">
              <input
                name="phone"
                maxLength={30}
                defaultValue={initial?.phone}
                placeholder="05xxxxxxxx"
                dir="ltr"
              />
            </Field>
          </div>
        </fieldset>
        <fieldset>
          <legend>
            <span>02</span>البيانات الوظيفية
          </legend>
          <div className="form-grid">
            <Field label="الوظيفة" required>
              <select
                name="jobPositionId"
                required
                defaultValue={initial?.jobPositionId ?? ""}
              >
                <option value="">اختر الوظيفة والقسم</option>
                {data?.jobs.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} —{" "}
                    {
                      data.departments.find((d) => d.id === x.departmentId)
                        ?.name
                    }
                  </option>
                ))}
              </select>
            </Field>
            <Field label="تاريخ الالتحاق" required>
              <input
                name="joinDate"
                type="date"
                required
                defaultValue={initial?.joinDate ?? defaultDate ?? date()}
              />
            </Field>
            <Field label="الحالة الوظيفية">
              <select name="status" defaultValue={initial?.status ?? "Active"}>
                <option value="Active">نشط</option>
                <option value="Inactive">غير نشط</option>
                <option value="Terminated">منتهي الخدمة</option>
              </select>
            </Field>
            <Field label="نوع العقد">
              <select
                name="contractType"
                defaultValue={initial?.contractType ?? "FixedTerm"}
              >
                <option value="FixedTerm">محدد المدة</option>
                <option value="Indefinite">غير محدد المدة</option>
              </select>
            </Field>
            <SearchPicker
              label="المدير المباشر"
              name="managerId"
              initial={initial?.managerId}
              initialName={initial?.managerName}
            />
          </div>
        </fieldset>
        {!data?.jobs.length && (
          <div className="inline-warning">
            أضف فرعًا وقسمًا ووظيفة من صفحة الهيكل التنظيمي أولًا.
          </div>
        )}
        {message && (
          <div className="error" role="alert">
            <Icon name="activity" />
            <span>{message}</span>
          </div>
        )}
        <div className="form-footer">
          <span>
            <Icon name="shield" size={16} />
            تُسجل التغييرات في سجل التدقيق.
          </span>
          <button
            disabled={busy || !data?.jobs.length}
            className="primary"
            type="submit"
          >
            {busy ? (
              <>
                <span className="spinner" />
                جارٍ الحفظ…
              </>
            ) : (
              <>
                <Icon name="check" size={18} />
                حفظ الموظف
              </>
            )}
          </button>
        </div>
      </form>
    </State>
  );
}
