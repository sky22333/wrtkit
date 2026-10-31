import { test } from "node:test";
import { strict as assert } from "node:assert";
import { retryBody } from "../src/buildRetry.ts";

test("retry uses only the exact request retained for the matching job", () => {
  const body = JSON.stringify({
    profile: "generic",
    root_password: "secret",
    packages: ["luci"],
  });
  const attempt = { jobId: "current", body };
  assert.equal(retryBody(attempt, "current"), body);
  assert.equal(retryBody(attempt, "history"), null);
  assert.equal(retryBody(null, "current"), null);
});
