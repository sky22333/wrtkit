import assert from "node:assert/strict";
import { test } from "node:test";
import { formatBytes } from "../src/format.ts";

test("formatBytes selects a readable binary unit", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(350), "350 B");
  assert.equal(formatBytes(1024), "1.0 KiB");
  assert.equal(formatBytes(15232), "14.9 KiB");
  assert.equal(formatBytes(1048576), "1.0 MiB");
  assert.equal(formatBytes(-1), "大小未知");
});
