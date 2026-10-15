import {
  type Dashboard,
  type Navigate,
  type User,
  activityLabel,
  formatDate,
  hasRole,
} from "../model";
import { Avatar, Empty, Icon, State, Status, type IconName } from "../ui";

function Metric({
  label,
  value,
  description,
  icon,
  tone = "green",
}: {
  label: string;
  value: number;
  description: string;
  icon: IconName;
  tone?: string;
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">
          <Icon name={icon} />
        </span>
      </div>
      <strong>{value.toLocaleString("en-US")}</strong>
      <p>{description}</p>
    </article>
  );
}
function WelcomeArt() {
  return (
    <svg
      className="welcome-art"
      viewBox="0 0 300 190"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="155" cy="100" r="86" fill="#fff" opacity=".055" />
      <circle cx="155" cy="100" r="64" stroke="#fff" opacity=".09" />
      <path d="M40 161h224" stroke="#8ab8a3" strokeWidth="1.5" />
      <rect x="113" y="31" width="86" height="130" rx="8" fill="#e1e7d5" />
      <rect x="78" y="73" width="60" height="88" rx="6" fill="#87ad98" />
      <rect x="183" y="94" width="46" height="67" rx="6" fill="#afc9b4" />
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M131 ${55 + i * 22}h13m16 0h20`}
          stroke="#416d58"
          strokeWidth="5"
          strokeLinecap="round"
        />
      ))}
      <path
        d="M95 94h15m-15 19h15m-15 19h15m84-18h10m-10 19h10"
        stroke="#3a6754"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M146 161v-18h20v18" fill="#416d58" />
      <circle cx="61" cy="115" r="16" fill="#c8b885" />
      <path d="M61 131v30m188-28v28" stroke="#8ab8a3" strokeWidth="3" />
      <circle cx="249" cy="122" r="12" fill="#9fb18a" />
      <rect x="208" y="31" width="38" height="38" rx="12" fill="#e8d9ae" />
      <path
        d="m218 50 7 7 12-14"
        stroke="#416d58"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M64 45h15m-8-7v15M253 82h9"
        stroke="#b9c9af"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function Overview({
  user,
  data,
  error,
  onNavigate,
  onRefresh,
  loading,
}: {
  user: User;
  data?: Dashboard;
  error: string;
  onNavigate: Navigate;
  onRefresh: () => void;
  loading: boolean;
}) {
  const hr = hasRole(user, "Administrator", "HR");
  const admin = hasRole(user, "Administrator");
  const payroll = hasRole(user, "Administrator", "Payroll");
  if (error && !data)
    return (
      <section className="card">
        <State error={error}>
          <span />
        </State>
        <button onClick={onRefresh}>
          <Icon name="refresh" />
          إعادة المحاولة
        </button>
      </section>
    );
  if (!data)
    return (
      <div
        className="dashboard-skeleton"
        role="status"
        aria-label="جارٍ تحميل لوحة المتابعة"
      >
        <div />
        <section>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} />
          ))}
        </section>
        <div />
      </div>
    );
  const employee = data.employees;
  const own = data.scope === "self";
  const ownProfile = data.recentEmployees[0];
  const steps = data.setup
    ? [
        {
          done: data.setup.organization,
          title: "عرّف منشأتك",
          description: "الاسم والمنطقة الزمنية",
          section: "organization" as const,
        },
        {
          done: data.setup.branches,
          title: "أضف الفروع",
          description: "مواقع العمل التابعة للمنشأة",
          section: "organization" as const,
        },
        {
          done: data.setup.departments,
          title: "نظّم الأقسام",
          description: "الأقسام والفرق داخل كل فرع",
          section: "organization" as const,
        },
        {
          done: data.setup.jobs,
          title: "حدد الوظائف",
          description: "المسميات المرتبطة بالأقسام",
          section: "organization" as const,
        },
        {
          done: data.setup.employees,
          title: "أضف الموظفين",
          description: "الملفات والبيانات الوظيفية",
          section: "employees" as const,
        },
        {
          done: data.setup.linkedAccounts,
          title: "اربط حسابات الفريق",
          description: "وصول كل موظف إلى ملفه",
          section: "users" as const,
        },
      ]
    : [];
  const completed = steps.filter((x) => x.done).length;
  const isReady = completed === steps.length;
  return (
    <>
      {error && (
        <div className="error" role="alert">
          تعذر تحديث اللوحة. البيانات المعروضة من آخر تحميل ناجح.
          <button onClick={onRefresh}>إعادة المحاولة</button>
        </div>
      )}
      <section className="welcome">
        <div className="welcome-copy">
          <span className="hero-label">
            <span />
            مساحة عمل واحدة لفريقك
          </span>
          <h2>
            {data.currentEmployeeName
              ? `أهلًا ${data.currentEmployeeName.split(" ")[0]}،`
              : "كل يوم، فريقك أقرب."}
          </h2>
          <p>
            {own
              ? "ملفك الوظيفي ومعلوماتك، في مكان واحد."
              : data.scope === "team"
                ? "تابع ملفك وفريقك المباشر، واطّلع على أحدث البيانات."
                : "نظرة واضحة على بيانات منشأتك، وخطوة أسرع لإنجاز أعمالك."}
          </p>
          <div className="hero-actions">
            {hr ? (
              <button
                className="button-light"
                onClick={() => onNavigate("employees", "new")}
              >
                <Icon name="plus" size={18} />
                إضافة موظف جديد
              </button>
            ) : (
              <button
                className="button-light"
                onClick={() => onNavigate(payroll ? "financial" : "employees")}
              >
                <Icon name={payroll ? "wallet" : "users"} size={18} />
                {payroll ? "البيانات المالية" : "فتح الملفات"}
              </button>
            )}
            <span>
              <Icon name="building" size={16} />
              {data.organizationName}
            </span>
          </div>
        </div>
        <WelcomeArt />
      </section>
      {employee && !own && (
        <section className="metrics-grid" aria-label="مؤشرات الموظفين">
          <Metric
            label={
              data.scope === "team" ? "ملفك وفريقك المباشر" : "إجمالي الموظفين"
            }
            value={employee.total}
            description="ضمن نطاق صلاحيات حسابك"
            icon="users"
          />
          <Metric
            label="الموظفون النشطون"
            value={employee.active}
            description="حالتهم الوظيفية نشطة"
            icon="check"
            tone="mint"
          />
          <Metric
            label="المنضمون هذا الشهر"
            value={employee.joinedThisMonth}
            description="حتى يوم العمل الحالي"
            icon="calendar"
            tone="sand"
          />
          {data.structure ? (
            <Metric
              label="فروع المنشأة"
              value={data.structure.branches}
              description={`${data.structure.departments} قسم · ${data.structure.jobs} وظيفة`}
              icon="building"
              tone="blue"
            />
          ) : (
            <Metric
              label="غير النشطين"
              value={employee.inactive + employee.terminated}
              description="غير نشط أو منتهي الخدمة"
              icon="briefcase"
              tone="blue"
            />
          )}
        </section>
      )}
      <div className="dashboard-columns">
        <div className="dashboard-main">
          {own ? (
            <section className="card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">بياناتك الوظيفية</span>
                  <h2>ملفي في المنشأة</h2>
                </div>
                <Icon name="briefcase" />
              </div>
              {ownProfile ? (
                <>
                  <div className="profile-summary">
                    <Avatar name={ownProfile.fullName} size="large" />
                    <div>
                      <h3>{ownProfile.fullName}</h3>
                      <p>
                        {ownProfile.job} · {ownProfile.department}
                      </p>
                      <Status value={ownProfile.status} />
                    </div>
                  </div>
                  <dl className="summary-grid">
                    <div>
                      <dt>الرقم الوظيفي</dt>
                      <dd className="code">{ownProfile.number}</dd>
                    </div>
                    <div>
                      <dt>الفرع</dt>
                      <dd>{ownProfile.branch}</dd>
                    </div>
                    <div>
                      <dt>تاريخ الالتحاق</dt>
                      <dd>{formatDate(ownProfile.joinDate)}</dd>
                    </div>
                  </dl>
                  <button
                    className="text-button"
                    onClick={() => onNavigate("employees", ownProfile.id)}
                  >
                    عرض الملف والمرفقات
                    <Icon name="arrow" size={16} />
                  </button>
                </>
              ) : (
                <Empty
                  title="ملفك غير مرتبط بعد"
                  description="تواصل مع مسؤول النظام لربط حسابك بملفك الوظيفي."
                />
              )}
            </section>
          ) : employee ? (
            <section className="card no-padding">
              <div className="section-heading panel-heading">
                <div>
                  <span className="eyebrow">ملفات الفريق</span>
                  <h2>آخر الموظفين انضمامًا</h2>
                </div>
                <button
                  className="text-button"
                  onClick={() => onNavigate("employees")}
                >
                  عرض الجميع
                  <Icon name="arrow" size={16} />
                </button>
              </div>
              {data.recentEmployees.length ? (
                <div className="recent-list">
                  {data.recentEmployees.map((e) => (
                    <button
                      className="recent-person"
                      key={e.id}
                      onClick={() => onNavigate("employees", e.id)}
                    >
                      <Avatar name={e.fullName} />
                      <div className="person-info">
                        <strong>{e.fullName}</strong>
                        <small>
                          {e.job} · {e.department}
                        </small>
                      </div>
                      <div className="recent-date">
                        <span>{formatDate(e.joinDate)}</span>
                        <Status value={e.status} />
                      </div>
                      <Icon name="arrow" size={16} />
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  title="هنا تبدأ ملفات فريقك"
                  description="أضف أول موظف بعد تجهيز الفروع والأقسام والوظائف."
                  action={
                    hr ? (
                      <button onClick={() => onNavigate("organization")}>
                        إعداد الهيكل التنظيمي
                      </button>
                    ) : undefined
                  }
                />
              )}
            </section>
          ) : (
            <section className="card">
              <div className="section-heading">
                <h2>مساحة البيانات المالية</h2>
                <Icon name="wallet" />
              </div>
              <p className="muted">
                راجع الراتب الأساسي والبنك وIBAN لكل موظف ضمن صلاحياتك.
              </p>
              <button
                className="primary"
                onClick={() => onNavigate("financial")}
              >
                فتح البيانات المالية
                <Icon name="arrow" size={17} />
              </button>
            </section>
          )}
          {admin && (
            <section className="card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">متابعة التغييرات</span>
                  <h2>آخر نشاط في المنشأة</h2>
                </div>
                <button
                  className="text-button"
                  onClick={() => onNavigate("audit")}
                >
                  سجل التدقيق
                  <Icon name="arrow" size={16} />
                </button>
              </div>
              {data.activity.length ? (
                <ol className="activity-list">
                  {data.activity.map((a) => (
                    <li key={a.id}>
                      <span className="activity-symbol">
                        <Icon name="check" size={15} />
                      </span>
                      <div>
                        <strong>{activityLabel(a.action)}</strong>
                        <small>{a.actorName}</small>
                      </div>
                      <time dateTime={a.occurredAt}>
                        {new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
                          timeZone: data.timeZone,
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(a.occurredAt))}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">
                  ستظهر عمليات التحديث هنا عند بدء إعداد منشأتك.
                </p>
              )}
            </section>
          )}
        </div>
        <div className="dashboard-side">
          {data.setup && (
            <section className={`card setup-card ${isReady ? "complete" : ""}`}>
              <div className="section-heading">
                <h2>{isReady ? "أساس منشأتك مكتمل" : "جهّز مساحة عملك"}</h2>
                <span className="setup-fraction">
                  {completed}/{steps.length}
                </span>
              </div>
              <p className="muted">
                {isReady
                  ? "يمكنك متابعة تحديث الهيكل وملفات الفريق من صفحاتها."
                  : "خطوات بسيطة لتنظيم بيانات فريقك والبدء."}
              </p>
              <progress
                value={completed}
                max={steps.length}
                aria-label="اكتمال إعداد المنشأة"
              />
              <ol className="setup-list">
                {steps.map((step, i) => (
                  <li key={step.title}>
                    <button onClick={() => onNavigate(step.section)}>
                      <span
                        className={`step-number ${step.done ? "done" : ""}`}
                      >
                        {step.done ? <Icon name="check" size={14} /> : i + 1}
                      </span>
                      <span>
                        <strong>{step.title}</strong>
                        <small>{step.description}</small>
                      </span>
                      <Icon name="arrow" size={15} />
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section className="card quick-actions">
            <div className="section-heading">
              <h2>وصول سريع</h2>
              <Icon name="briefcase" size={18} />
            </div>
            {hr && (
              <>
                <button onClick={() => onNavigate("import")}>
                  <span className="action-icon">
                    <Icon name="upload" />
                  </span>
                  <span>
                    <strong>استيراد الموظفين</strong>
                    <small>من ملف Excel مع معاينة</small>
                  </span>
                  <Icon name="arrow" size={16} />
                </button>
                <button onClick={() => onNavigate("organization")}>
                  <span className="action-icon">
                    <Icon name="building" />
                  </span>
                  <span>
                    <strong>الهيكل التنظيمي</strong>
                    <small>الفروع والأقسام والوظائف</small>
                  </span>
                  <Icon name="arrow" size={16} />
                </button>
              </>
            )}
            {admin && (
              <button onClick={() => onNavigate("users")}>
                <span className="action-icon">
                  <Icon name="users" />
                </span>
                <span>
                  <strong>حسابات الفريق</strong>
                  <small>الربط والأدوار والصلاحيات</small>
                </span>
                <Icon name="arrow" size={16} />
              </button>
            )}
            {payroll && (
              <button onClick={() => onNavigate("financial")}>
                <span className="action-icon">
                  <Icon name="wallet" />
                </span>
                <span>
                  <strong>البيانات المالية</strong>
                  <small>بيانات مقيدة حسب الصلاحيات</small>
                </span>
                <Icon name="arrow" size={16} />
              </button>
            )}
            <button onClick={() => onNavigate("security")}>
              <span className="action-icon">
                <Icon name="shield" />
              </span>
              <span>
                <strong>أمان الحساب</strong>
                <small>تحديث كلمة المرور والجلسات</small>
              </span>
              <Icon name="arrow" size={16} />
            </button>
          </section>
          {data.structure && (
            <section className="card branch-card">
              <div className="section-heading">
                <h2>الموظفون حسب الفرع</h2>
                <Icon name="building" size={18} />
              </div>
              {data.branches.length ? (
                <div className="branch-bars">
                  {data.branches.map((b) => (
                    <div key={b.id}>
                      <div>
                        <span>{b.name}</span>
                        <strong>{b.employees}</strong>
                      </div>
                      <progress
                        value={b.employees}
                        max={Math.max(
                          1,
                          ...data.branches.map((x) => x.employees),
                        )}
                        aria-label={`${b.name}: ${b.employees} موظف`}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">أضف فروع المنشأة لعرض توزيع الموظفين.</p>
              )}
              {data.structure.branches > data.branches.length && (
                <button
                  className="text-button"
                  onClick={() => onNavigate("organization")}
                >
                  عرض جميع الفروع
                  <Icon name="arrow" size={16} />
                </button>
              )}
            </section>
          )}
          <div className="privacy-note">
            <Icon name="shield" size={18} />
            <p>تظهر لك البيانات والإجراءات المسموح بها لحسابك فقط.</p>
          </div>
        </div>
      </div>
      <div className="dashboard-updated">
        <span className={loading ? "updating-dot" : "live-dot"} />
        {loading
          ? "جارٍ تحديث البيانات…"
          : `يوم العمل: ${formatDate(data.businessDate)}`}
        <button className="text-button" disabled={loading} onClick={onRefresh}>
          <Icon name="refresh" size={14} />
          تحديث اللوحة
        </button>
      </div>
    </>
  );
}
