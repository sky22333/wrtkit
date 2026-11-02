import { test, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { api, apiText } from "../src/api.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  Reflect.deleteProperty(globalThis, "window");
});

test("text requests return logs and notify authentication expiry", async () => {
  const events = new EventTarget();
  Object.assign(globalThis, { window: events });
  let unauthorized = 0;
  events.addEventListener("wrtkit-unauthorized", () => unauthorized++);
  globalThis.fetch = async () => new Response("log line", { status: 200 });
  assert.equal(await apiText("/jobs/id/log"), "log line");
  globalThis.fetch = async () => new Response("not JSON", { status: 401 });
  await assert.rejects(apiText("/jobs/id/log"), /401/);
  assert.equal(unauthorized, 1);
});

test("JSON requests preserve server errors and do not treat login failure as session expiry", async () => {
  const events = new EventTarget();
  Object.assign(globalThis, { window: events });
  let unauthorized = 0;
  events.addEventListener("wrtkit-unauthorized", () => unauthorized++);
  globalThis.fetch = async () =>
    Response.json({ error: "用户名或密码错误" }, { status: 401 });
  await assert.rejects(api("/auth/login"), /用户名或密码错误/);
  assert.equal(unauthorized, 0);
});
