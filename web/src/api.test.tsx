import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
afterEach(() => vi.unstubAllGlobals());
it("treats an empty nullable GET result as null so initial setup can render", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("", { status: 200, headers: { "content-length": "0" } }),
      ),
  );
  expect(await api("/organization")).toBeNull();
});
it("uses same-origin cookies and a fresh CSRF token for each mutation", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('{"token":"csrf-test"}', { status: 200 }),
    )
    .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  expect(await api("/employees", "POST", { number: "E1" })).toEqual({
    ok: true,
  });
  expect(fetch.mock.calls[1][1]).toMatchObject({
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "X-CSRF-TOKEN": "csrf-test",
      "Content-Type": "application/json",
    },
  });
});
it("propagates server failure without showing success", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response('{"message":"لا تملك صلاحية"}', { status: 403 }),
      ),
  );
  await expect(api("/employees")).rejects.toThrow("لا تملك صلاحية");
});
