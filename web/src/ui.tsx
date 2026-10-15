import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { statusLabel } from "./model";

export type IconName =
  | "home"
  | "users"
  | "building"
  | "upload"
  | "wallet"
  | "shield"
  | "activity"
  | "logout"
  | "plus"
  | "search"
  | "close"
  | "check"
  | "arrow"
  | "menu"
  | "chevron"
  | "calendar"
  | "briefcase"
  | "refresh"
  | "mail"
  | "file"
  | "globe"
  | "eye"
  | "lock";
const paths: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="m3 10 9-7 9 7v10H3Z" />
      <path d="M9 20v-7h6v7" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a6 6 0 0 1 3 5v2" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V3h12v18M16 9h4v12M2 21h20M8 7h4M8 11h4M8 15h4M8 21v-2h4v2" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 7H4V3h14v4M4 7v14h17V7Z" />
      <path d="M21 12h-6v5h6" />
      <path d="M17 14.5h.01" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  activity: (
    <>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </>
  ),
  logout: (
    <>
      <path d="M9 4H4v16h5m5-12 4 4-4 4m-6-4h13" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <path d="M20 12H4m6-6-6 6 6 6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4m10-4v4M3 11h18m-14 4h3m4 0h3" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="14" rx="2" />
      <path d="M8 7V3h8v4M3 12l9 4 9-4m-9 2v4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 10a8 8 0 0 0-14-5L3 8m0-5v5h5M4 14a8 8 0 0 0 14 5l3-3m0 5v-5h-5" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H5v18h14V8Z" />
      <path d="M14 3v5h5M8 12h8m-8 4h6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
    </>
  ),
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
export function Field({
  label,
  children,
  help,
  required,
  controlId,
}: {
  label: string;
  children: ReactNode;
  help?: string;
  required?: boolean;
  controlId?: string;
}) {
  const generated = useId();
  const id = controlId ?? generated;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {isValidElement(children) && !controlId
        ? cloneElement(
            children as ReactElement<{
              id: string;
              "aria-describedby"?: string;
            }>,
            { id, ...(help ? { "aria-describedby": `${id}-help` } : {}) },
          )
        : children}
      {help && (
        <small id={`${id}-help`} className="field-help">
          {help}
        </small>
      )}
    </div>
  );
}
export function State({
  error,
  loading,
  children,
}: {
  error?: string;
  loading?: boolean;
  children: ReactNode;
}) {
  return error ? (
    <div className="error" role="alert">
      <Icon name="activity" />
      <span>{error}</span>
    </div>
  ) : loading ? (
    <div className="loading-state" role="status">
      <span className="spinner" />
      جارٍ تحميل البيانات…
    </div>
  ) : (
    <>{children}</>
  );
}
export function Empty({
  title = "لا توجد سجلات بعد",
  description,
  action,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name="users" size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span
      className={`status ${value === "Active" ? "good" : value === "Terminated" ? "danger" : ""}`}
    >
      <span />
      {statusLabel(value)}
    </span>
  );
}
export function Avatar({
  name,
  size = "normal",
}: {
  name: string;
  size?: "normal" | "large";
}) {
  return (
    <span className={`person-avatar ${size}`} aria-hidden="true">
      {name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((n) => n[0])
        .join("")}
    </span>
  );
}
export function Pager({
  page,
  setPage,
  total,
}: {
  page: number;
  setPage: (p: number) => void;
  total: number;
}) {
  const start = total ? (page - 1) * 20 + 1 : 0;
  return (
    <div className="pager">
      <span>
        عرض{" "}
        <b>
          {start}–{Math.min(page * 20, total)}
        </b>{" "}
        من <b>{total}</b> سجل
      </span>
      <div>
        <button
          aria-label="الصفحة السابقة"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <Icon name="chevron" size={16} />
        </button>
        <span className="page-number">{page}</span>
        <button
          aria-label="الصفحة التالية"
          disabled={page * 20 >= total}
          onClick={() => setPage(page + 1)}
        >
          <span className="flipped">
            <Icon name="chevron" size={16} />
          </span>
        </button>
      </div>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
  subtitle,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  subtitle?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const el = ref.current!;
    const prior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (typeof el.showModal === "function") el.showModal();
    else el.setAttribute("open", "");
    return () => {
      if (typeof el.close === "function") el.close();
      document.body.style.overflow = overflow;
      prior?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="profile-dialog"
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <div>
            <h2 id={id}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="إغلاق ملف الموظف"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
