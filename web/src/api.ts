export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== "GET") {
    const tokenResponse = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!tokenResponse.ok) throw new Error("تعذر التحقق من الجلسة.");
    headers["X-CSRF-TOKEN"] = (await tokenResponse.json()).token;
  }
  const isFile = body instanceof FormData;
  if (body !== undefined && !isFile)
    headers["Content-Type"] = "application/json";
  const response = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    body: body === undefined ? undefined : isFile ? body : JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login")
      window.dispatchEvent(new Event("session-expired"));
    const error = await response.json().catch(() => null);
    throw new Error(
      error?.message ??
        (response.status === 401
          ? "انتهت الجلسة؛ سجل الدخول مجددًا."
          : response.status === 403
            ? "لا تملك صلاحية لهذه العملية."
            : response.status === 404
              ? "السجل غير موجود أو غير متاح لك."
              : "تعذر الاتصال بالخدمة."),
    );
  }
  if (response.status === 204 || response.headers.get("content-length") === "0")
    return (method === "GET" ? null : undefined) as T;
  const text = await response.text();
  return text
    ? (JSON.parse(text) as T)
    : ((method === "GET" ? null : undefined) as T);
}
export const formValues = (form: HTMLFormElement) =>
  Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
