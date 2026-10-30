import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHINESE_BASE,
  hasWirelessDriver,
  resolveChineseTranslations,
  translationCandidate,
  visibleInCategory,
} from "../src/packageSelection.ts";

test("wireless options require a known selected wireless driver", () => {
  assert.equal(hasWirelessDriver(["kmod-mt7915e", "wpad-openssl"]), true);
  assert.equal(hasWirelessDriver(["kmod-usb-net-rtl8152", "ppp"]), false);
  assert.equal(hasWirelessDriver(["kmod-rtl8xxxu"]), false);
  assert.equal(
    hasWirelessDriver(["kmod-rtl8xxxu", "wpad-basic-mbedtls"]),
    true,
  );
});

test("matches only existing translations and reports missing packages", () => {
  const available = new Set([
    "luci-i18n-ddns-zh-cn",
    "luci-i18n-openclash-zh-cn",
    CHINESE_BASE,
  ]);
  const result = resolveChineseTranslations(
    ["luci-app-ddns", "luci-app-openclash", "luci-theme-argon", "curl"],
    available,
  );
  assert.deepEqual(result.automatic, [
    "luci-i18n-ddns-zh-cn",
    "luci-i18n-openclash-zh-cn",
  ]);
  assert.deepEqual(result.missing, ["luci-theme-argon"]);
  assert.equal(
    translationCandidate("luci-proto-wireguard"),
    "luci-i18n-wireguard-zh-cn",
  );
});
test("translation is removed when its originating app is unselected", () => {
  const available = new Set(["luci-i18n-ddns-zh-cn"]);
  assert.deepEqual(
    resolveChineseTranslations(["luci-app-ddns"], available).automatic,
    ["luci-i18n-ddns-zh-cn"],
  );
  assert.deepEqual(resolveChineseTranslations([], available).automatic, []);
});
test("proxy shows LuCI applications and themes only theme packages", () => {
  assert.equal(
    visibleInCategory("luci-i18n-homeproxy-zh-cn", "proxy", "proxy"),
    false,
  );
  assert.equal(
    visibleInCategory("luci-i18n-homeproxy-fr", "proxy", "proxy"),
    false,
  );
  assert.equal(visibleInCategory("luci-app-homeproxy", "proxy", "proxy"), true);
  assert.equal(visibleInCategory("sing-box", "proxy", "proxy"), false);
  assert.equal(visibleInCategory("luci-i18n-ddns-zh-cn", "proxy", ""), false);
  assert.equal(visibleInCategory("luci-theme-argon", "themes", ""), true);
  assert.equal(visibleInCategory("luci-i18n-argon-zh-cn", "themes", ""), false);
  assert.equal(
    visibleInCategory("luci-i18n-homeproxy-fr", "all", "proxy"),
    true,
  );
});
import {
  availableRecommendations,
  effectiveDefaultPackages,
  RECOMMENDED_PACKAGES,
} from "../src/packageSelection.ts";

test("device-specific removals override upstream default packages", () => {
  assert.deepEqual(
    effectiveDefaultPackages(
      ["base-files", "wpad-openssl", "luci"],
      ["-wpad-openssl", "kmod-a", "luci"],
    ),
    ["base-files", "kmod-a", "luci"],
  );
});
test("recommended packages are selected only when actually available", () => {
  const available = new Set([
    "curl",
    "luci-theme-argon",
    CHINESE_BASE,
    "luci-i18n-ttyd-zh-cn",
  ]);
  const selected = availableRecommendations(available);
  assert.equal(selected.theme, "luci-theme-argon");
  assert.deepEqual(selected.packages, [
    "curl",
    CHINESE_BASE,
    "luci-i18n-ttyd-zh-cn",
  ]);
  assert.ok(selected.missing.includes("openssh-sftp-server"));
  assert.equal(
    selected.packages.length + selected.missing.length + 1,
    RECOMMENDED_PACKAGES.length,
  );
  assert.equal(availableRecommendations(new Set()).theme, "");
});

test("hidden theme translations are still automatically selected when available", () => {
  const result = resolveChineseTranslations(
    ["luci-theme-example"],
    new Set(["luci-i18n-example-zh-cn"]),
  );
  assert.deepEqual(result.automatic, ["luci-i18n-example-zh-cn"]);
  assert.equal(
    visibleInCategory("luci-i18n-example-zh-cn", "themes", ""),
    false,
  );
});
