import { useEffect, useRef, useState } from "react";
import { useDebouncedValue, useLoad } from "../hooks";
import { type Employee, type Page } from "../model";
export function SearchPicker({
  label,
  name,
  initial,
  initialName,
}: {
  label: string;
  name: string;
  initial?: string | null;
  initialName?: string | null;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(initial ?? "");
  const ref = useRef<HTMLDivElement>(null);
  const term = useDebouncedValue(q);
  const { data, error } = useLoad<Page<Employee>>(
    `/employees?q=${encodeURIComponent(term)}&pageSize=20`,
  );
  useEffect(() => {
    const form = ref.current?.closest("form");
    const reset = () => {
      setSelected(initial ?? "");
      setQ("");
    };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [initial]);
  return (
    <div className="field" ref={ref}>
      <span>{label}</span>
      <input
        aria-label={`بحث ${label}`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ابحث بالاسم أو الرقم الوظيفي"
        maxLength={160}
      />
      <select
        name={name}
        aria-label={label}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">بدون ربط</option>
        {selected && !data?.items.some((e) => e.id === selected) && (
          <option value={selected}>{initialName ?? "الربط الحالي"}</option>
        )}
        {data?.items.map((e) => (
          <option key={e.id} value={e.id}>
            {e.number} — {e.fullName}
          </option>
        ))}
      </select>
      {error && <small className="error">{error}</small>}
    </div>
  );
}
