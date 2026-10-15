import { useEffect, useState } from "react";
import { api } from "./api";
import { errorText, type Section } from "./model";

export function useLoad<T>(path: string | null, revision = 0, retain = false) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    if (!path) {
      setData(undefined);
      setError("");
      setLoading(false);
      return;
    }
    if (!retain) setData(undefined);
    setError("");
    setLoading(true);
    api<T>(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision, retain]);
  return { data, error, loading };
}
export function useDebouncedValue<T>(value: T, delay = 250) {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setCurrent(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return current;
}
const sections: Section[] = [
  "home",
  "employees",
  "organization",
  "import",
  "users",
  "audit",
  "financial",
  "security",
];
function readRoute() {
  const [raw, detail] = window.location.hash.slice(1).split("/");
  return {
    section: sections.includes(raw as Section)
      ? (raw as Section)
      : ("home" as Section),
    detail: detail ?? "",
  };
}
export function useRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  function navigate(section: Section, detail = "") {
    const hash = `#${section}${detail ? "/" + detail : ""}`;
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    setRoute({ section, detail });
  }
  return { ...route, navigate };
}
