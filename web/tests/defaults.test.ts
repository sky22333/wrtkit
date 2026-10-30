import test from "node:test";
import assert from "node:assert/strict";
import { initialBuild } from "../src/defaults.ts";

test("firmware defaults are actual values", () => {
  assert.equal(initialBuild.hostname, "WrtKit");
  assert.equal(initialBuild.address, "192.168.2.1/24");
  assert.equal(initialBuild.timezone, "Asia/Shanghai");
  assert.equal(initialBuild.mirror, "");
});
