import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api, formValues } from "./api";
import { useLoad, useRoute } from "./hooks";
import { roles, words } from "./i18n";
import {
  hasRole,
  errorText,
  type User,
  type Dashboard,
  type Section,
  type Notice,
} from "./model";
import { Field, Icon, type IconName } from "./ui";
import { Overview } from "./pages/Overview";
import { Employees } from "./pages/Employees";
import {
  Organization,
  ImportEmployees,
  Users,
  Audit,
  Financial,
  PasswordForm,
} from "./pages/FoundationPages";

const descriptions: Record<Section, string> = {
  home: "صورة واضحة لفريقك، وكل ما تحتاجه لبدء يومك.",
  employees: "إدارة ملفات الفريق والبيانات الوظيفية من مكان واحد.",
  organization: "ابدأ بمنشأتك، ثم رتّب الفروع والأقسام والوظائف.",
  import: "أضف فريقك من ملف Excel، مع مراجعة البيانات قبل حفظها.",
  users: "امنح كل شخص الوصول المناسب واربطه بملفه الوظيفي.",
  audit: "تتبّع التغييرات ومن أجراها، بوضوح.",
  financial: "إدارة بيانات الراتب الأساسي والبنك حسب صلاحياتك.",
  security: "حافظ على أمان حسابك وحدّث كلمة المرور.",
};
type Toast = {
  message: string;
  tone: "success" | "error" | "info";
  id: number;
};
export default function App() {
  const [user, setUser] = useState<User | null>();
  const [authError, setAuthError] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const lang = "ar";
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const userRef = useRef(user);
  userRef.current = user;
  const route = useRoute();
  const { data: meta } = useLoad<{ name: string }>("/meta");
  const dashboard = useLoad<Dashboard>(
    user ? "/dashboard" : null,
    revision,
    true,
  );
  const t = words[lang];
  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null));
  }, []);
  useEffect(() => {
    const expired = () => {
      if (userRef.current) {
        setUser(null);
        setAuthError("انتهت الجلسة. سجل الدخول للمتابعة.");
      }
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
  useEffect(() => {
    if (meta?.name) document.title = meta.name;
  }, [meta]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!toast || toast.tone === "error") return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    setMenuOpen(false);
    setSearch("");
    setEmployeeSearch("");
  }, [user?.id]);
  useEffect(() => {
    if (!menuOpen) return;
    const navigation = document.getElementById("main-navigation");
    const opener = document.querySelector<HTMLButtonElement>(".mobile-menu");
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    navigation?.querySelector<HTMLButtonElement>(".mobile-nav-close")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !navigation) return;
      const items = Array.from(
        navigation.querySelectorAll<HTMLElement>(
          "button:not([disabled]),a[href]",
        ),
      ).filter((el) => el.getClientRects().length > 0);
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", trap);
    return () => {
      window.removeEventListener("keydown", trap);
      document.body.style.overflow = before;
      opener?.focus();
    };
  }, [menuOpen]);
  const notify: Notice = useCallback((message, tone = "success") => {
    setToast({ message, tone, id: Date.now() });
    if (tone === "success") setRevision((v) => v + 1);
  }, []);
  function go(section: Section, detail = "") {
    route.navigate(section, detail);
    setMenuOpen(false);
    if (section !== "employees") setEmployeeSearch("");
  }
  const has = (...r: string[]) => !!user && hasRole(user, ...r);
  const links: { id: Section; label: string; icon: IconName; group: string }[] =
    [
      { id: "home", label: t.home, icon: "home", group: "مساحة العمل" },
      ...(has("Administrator", "HR", "Manager", "Employee")
        ? [
            {
              id: "employees" as const,
              label: has("Administrator", "HR")
                ? t.employees
                : has("Manager")
                  ? "الفريق"
                  : "ملفي",
              icon: "users" as const,
              group: "مساحة العمل",
            },
          ]
        : []),
      ...(has("Administrator", "HR")
        ? [
            {
              id: "organization" as const,
              label: t.organization,
              icon: "building" as const,
              group: "إدارة المنشأة",
            },
            {
              id: "import" as const,
              label: t.import,
              icon: "upload" as const,
              group: "إدارة المنشأة",
            },
          ]
        : []),
      ...(has("Administrator", "Payroll")
        ? [
            {
              id: "financial" as const,
              label: t.financial,
              icon: "wallet" as const,
              group: "إدارة المنشأة",
            },
          ]
        : []),
      ...(has("Administrator")
        ? [
            {
              id: "users" as const,
              label: t.users,
              icon: "shield" as const,
              group: "إدارة النظام",
            },
            {
              id: "audit" as const,
              label: t.audit,
              icon: "activity" as const,
              group: "إدارة النظام",
            },
          ]
        : []),
      {
        id: "security",
        label: lang === "ar" ? "أمان الحساب" : "Account security",
        icon: "lock",
        group: "إدارة النظام",
      },
    ];
  const section = links.some((x) => x.id === route.section)
    ? route.section
    : "home";
  async function logout() {
    try {
      await api("/auth/logout", "POST");
      setUser(null);
      setAuthError("");
      setToast(null);
      route.navigate("home");
    } catch (e) {
      notify(errorText(e), "error");
    }
  }
  if (user === undefined)
    return (
      <div className="session-loading">
        <span className="brand-icon">HR</span>
        <span className="spinner" />
        <p>جارٍ تجهيز مساحة عملك…</p>
      </div>
    );
  if (user === null)
    return (
      <Login
        name={meta?.name ?? "HR Platform"}
        error={authError}
        onSubmit={async (x) => {
          setAuthError("");
          try {
            await api("/auth/login", "POST", x);
            setUser(await api<User>("/auth/me"));
          } catch (e) {
            setAuthError(errorText(e));
          }
        }}
      />
    );
  const organization =
    dashboard.data?.organizationName ?? meta?.name ?? "HR Platform";
  const title = links.find((x) => x.id === section)?.label ?? t.home;
  const dateLabel = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    timeZone: dashboard.data?.timeZone ?? "Asia/Riyadh",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  return (
    <div className="shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        انتقل إلى المحتوى
      </a>
      {menuOpen && (
        <button
          className="navigation-backdrop"
          aria-label="إغلاق قائمة التنقل"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        className={menuOpen ? "sidebar is-open" : "sidebar"}
        id="main-navigation"
        aria-label="القائمة الرئيسية"
      >
        <div className="brand">
          <span className="brand-icon">HR</span>
          <div>
            <strong>{meta?.name ?? "HR Platform"}</strong>
            <small>إدارة الموارد البشرية</small>
          </div>
          <button
            className="icon-button mobile-nav-close"
            aria-label="إغلاق القائمة"
            onClick={() => setMenuOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="organization-badge">
          <span className="organization-symbol">
            <Icon name="building" size={19} />
          </span>
          <div>
            <small>المنشأة</small>
            <strong>{organization}</strong>
          </div>
        </div>
        <nav aria-label="صفحات النظام">
          {links.map((link, i) => (
            <div key={link.id}>
              {(i === 0 || links[i - 1].group !== link.group) && (
                <span className="nav-caption">{link.group}</span>
              )}
              <button
                aria-label={link.label}
                aria-current={section === link.id ? "page" : undefined}
                className={section === link.id ? "nav-link active" : "nav-link"}
                onClick={() => go(link.id)}
              >
                <Icon name={link.icon} size={19} />
                <span>{link.label}</span>
                {section === link.id && <span className="nav-indicator" />}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="user-avatar">{user.email[0]?.toUpperCase()}</span>
          <div>
            <strong>{user.email}</strong>
            <small>{user.roles.map((r) => roles[r]).join("، ")}</small>
          </div>
          <button
            className="sidebar-logout icon-button"
            aria-label={t.logout}
            title={t.logout}
            onClick={logout}
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="app-header">
          <div className="header-start">
            <button
              className="icon-button mobile-menu"
              aria-label="فتح القائمة"
              aria-expanded={menuOpen}
              aria-controls="main-navigation"
              onClick={() => setMenuOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <div className="breadcrumb">
              <span>{organization}</span>
              <Icon name="chevron" size={13} />
              <strong>{title}</strong>
            </div>
          </div>
          {has("Administrator", "HR", "Manager", "Employee") && (
            <form
              className="header-search search-box"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                setEmployeeSearch(search.trim());
                go("employees");
                setSearch("");
              }}
            >
              <Icon name="search" size={18} />
              <input
                aria-label="بحث سريع عن الموظفين"
                placeholder="ابحث عن موظف بالاسم أو الرقم…"
                maxLength={160}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                className="search-submit"
                type="submit"
                aria-label="تنفيذ البحث السريع"
              >
                <Icon name="arrow" size={16} />
              </button>
            </form>
          )}
          <div className="header-actions">
            <span className="language-label">
              <Icon name="globe" size={16} />
              العربية
            </span>
            <span className="header-divider" />
            <button
              className="header-profile"
              aria-label="فتح أمان الحساب"
              onClick={() => go("security")}
            >
              <span className="user-avatar">
                {user.email[0]?.toUpperCase()}
              </span>
              <span>
                <strong>
                  {dashboard.data?.currentEmployeeName ?? roles[user.roles[0]]}
                </strong>
                <small>{user.roles.map((r) => roles[r]).join("، ")}</small>
              </span>
            </button>
          </div>
        </header>
        {!online && (
          <div className="offline-banner" role="alert">
            أنت غير متصل بالشبكة. يلزم الاتصال بالخادم لحفظ التغييرات.
          </div>
        )}
        <main id="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {section === "home" ? "مساحة العمل لفريقك" : organization}
              </span>
              <h1>{section === "home" ? "نظرة عامة على منشأتك" : title}</h1>
              <p>{descriptions[section]}</p>
            </div>
            <div className="page-date">
              <span className="date-icon">
                <Icon name="calendar" size={19} />
              </span>
              <span>
                <small>اليوم</small>
                <strong>{dateLabel}</strong>
              </span>
            </div>
          </div>
          {toast && (
            <div
              className={`toast ${toast.tone}`}
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
            >
              <Icon
                name={toast.tone === "error" ? "activity" : "check"}
                size={19}
              />
              <span>{toast.message}</span>
              <button
                className="icon-button"
                aria-label="إغلاق التنبيه"
                onClick={() => setToast(null)}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {section === "home" && (
            <Overview
              user={user}
              data={dashboard.data}
              error={dashboard.error}
              loading={dashboard.loading}
              onNavigate={go}
              onRefresh={() => setRevision((v) => v + 1)}
            />
          )}
          {section === "employees" && (
            <Employees
              canEdit={has("Administrator", "HR")}
              notify={notify}
              detail={route.detail}
              onNavigate={go}
              initialSearch={employeeSearch}
              timeZone={dashboard.data?.timeZone}
            />
          )}
          {section === "organization" && (
            <Organization admin={has("Administrator")} notify={notify} />
          )}
          {section === "import" && <ImportEmployees notify={notify} />}
          {section === "users" && <Users notify={notify} />}
          {section === "audit" && <Audit />}
          {section === "financial" && <Financial notify={notify} />}
          {section === "security" && (
            <PasswordForm
              onSuccess={() => {
                setUser(null);
                setAuthError(
                  "تم تغيير كلمة المرور. سجل الدخول بالكلمة الجديدة.",
                );
              }}
            />
          )}
        </main>
        <footer className="app-footer">
          <span>
            {meta?.name ?? "HR Platform"}
            <span className="footer-dot" />
            مساحة عمل أكثر تنظيمًا
          </span>
          <span>
            <Icon name="shield" size={14} />
            بياناتك تظهر حسب صلاحياتك
          </span>
        </footer>
      </div>
    </div>
  );
}

function Login({
  name,
  error,
  onSubmit,
}: {
  name: string;
  error: string;
  onSubmit: (x: Record<string, string>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit(formValues(e.currentTarget));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="brand">
          <span className="brand-icon">HR</span>
          <div>
            <strong>{name}</strong>
            <small>إدارة الموارد البشرية</small>
          </div>
        </div>
        <div className="login-brand-copy">
          <span className="hero-label">
            <span />
            مساحة عمل واحدة لفريقك
          </span>
          <h1>
            كل تفاصيل فريقك،
            <br />
            <em>في مكان واحد.</em>
          </h1>
          <p>نظّم بيانات منشأتك وموظفيك، وامنح كل شخص الوصول المناسب لعمله.</p>
          <div className="login-features">
            <span>
              <Icon name="users" size={19} />
              ملفات موظفين منظمة
            </span>
            <span>
              <Icon name="building" size={19} />
              هيكل واضح للمنشأة
            </span>
            <span>
              <Icon name="shield" size={19} />
              صلاحيات تحفظ الخصوصية
            </span>
          </div>
        </div>
        <div className="login-brand-footer">
          <span>{name}</span>
          <small>أعمال أكثر وضوحًا. فريق أقرب.</small>
        </div>
      </section>
      <section className="login-form-panel">
        <div className="login-form-wrap">
          <span className="login-lock">
            <Icon name="lock" size={25} />
          </span>
          <span className="eyebrow">أهلًا بعودتك</span>
          <h2>تسجيل الدخول</h2>
          <p className="login-description">ادخل إلى مساحة عملك وابدأ يومك.</p>
          <form onSubmit={submit}>
            <Field label="البريد الإلكتروني" required>
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                placeholder="name@company.com"
                dir="ltr"
              />
            </Field>
            <Field label="كلمة المرور" required controlId="login-password">
              <div className="password-field">
                <input
                  id="login-password"
                  name="password"
                  aria-label="كلمة المرور"
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  maxLength={256}
                  placeholder="أدخل كلمة المرور"
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={
                    visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"
                  }
                  aria-pressed={visible}
                  onClick={() => setVisible((v) => !v)}
                >
                  <Icon name="eye" size={19} />
                </button>
              </div>
            </Field>
            {error && (
              <div className="error" role="alert">
                <Icon name="activity" size={18} />
                <span>{error}</span>
              </div>
            )}
            <button
              className="primary login-submit"
              disabled={busy}
              type="submit"
            >
              {busy ? (
                <>
                  <span className="spinner" />
                  جارٍ التحقق…
                </>
              ) : (
                <>
                  دخول إلى حسابك
                  <Icon name="arrow" size={18} />
                </>
              )}
            </button>
          </form>
          <div className="login-help">
            <Icon name="shield" size={17} />
            <p>
              لإنشاء حساب أو استعادة الوصول، تواصل مع مسؤول النظام في منشأتك.
            </p>
          </div>
        </div>
        <div className="login-form-footer">
          {name}
          <span />
          بوابة المنشأة
        </div>
      </section>
    </main>
  );
}
