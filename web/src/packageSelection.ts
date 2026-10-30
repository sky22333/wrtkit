export const CHINESE_BASE = "luci-i18n-base-zh-cn";

// profiles.json does not describe radios. Recognize wireless drivers explicitly
// present in the selected firmware package list; absence is not proof of no radio.
export function hasWirelessDriver(packages: readonly string[]): boolean {
  return (
    packages.some((name) =>
      /^kmod-(?:mt7|ath(?:5k|9k|10k|11k|12k)|iwl|rt2|rtw|rtl8(?:xxxu|188|192|7)|brcm(?:fmac|mac)|b43|mwifiex|mwlwifi|wl18|zd1211)/.test(
        name,
      ),
    ) && packages.some((name) => /^(?:wpad|hostapd)(?:-|$)/.test(name))
  );
}

// LuCI's common translation naming convention. Only names present in the
// selected mirror index are ever returned as automatic selections.
export function translationCandidate(name: string): string | undefined {
  const match = /^luci-(?:app|proto|mod|theme)-(.+)$/.exec(name);
  return match ? `luci-i18n-${match[1]}-zh-cn` : undefined;
}

export function resolveChineseTranslations(
  selected: string[],
  available: ReadonlySet<string>,
): { automatic: string[]; missing: string[] } {
  const automatic = new Set<string>();
  const missing = new Set<string>();
  for (const name of selected) {
    const candidate = translationCandidate(name);
    if (!candidate) continue;
    if (available.has(candidate)) automatic.add(candidate);
    else missing.add(name);
  }
  return { automatic: [...automatic].sort(), missing: [...missing].sort() };
}

export function visibleInCategory(
  name: string,
  category: string,
  inferred: string,
): boolean {
  if (category === "all") return true;
  if (category === "luci") return /^luci-(?:app|proto|mod)-/.test(name);
  if (category === "proxy")
    return inferred === "proxy" && name.startsWith("luci-app-");
  if (category === "themes") return name.startsWith("luci-theme-");
  return false;
}

// Device profiles express removals with a leading minus sign. ImageBuilder
// applies those removals to the combined default and device package list.
export function effectiveDefaultPackages(
  defaults: readonly string[],
  device: readonly string[],
): string[] {
  const entries = [...defaults, ...device];
  const removed = new Set(
    entries.filter((name) => name.startsWith("-")).map((name) => name.slice(1)),
  );
  return [
    ...new Set(
      entries.filter(
        (name) => name && !name.startsWith("-") && !removed.has(name),
      ),
    ),
  ].sort();
}

export const RECOMMENDED_PACKAGES = [
  "curl",
  "openssh-sftp-server",
  "luci-theme-argon",
  CHINESE_BASE,
  "luci-i18n-firewall-zh-cn",
  "luci-i18n-package-manager-zh-cn",
  "luci-i18n-homeproxy-zh-cn",
  "luci-i18n-ttyd-zh-cn",
  "luci-i18n-diskman-zh-cn",
  "luci-i18n-filemanager-zh-cn",
] as const;

export function availableRecommendations(available: ReadonlySet<string>): {
  packages: string[];
  theme: string;
  missing: string[];
} {
  const packages: string[] = [];
  const missing: string[] = [];
  let theme = "";
  for (const name of RECOMMENDED_PACKAGES) {
    if (!available.has(name)) {
      missing.push(name);
      continue;
    }
    if (name === "luci-theme-argon") theme = name;
    else {
      const app = name.replace(/^luci-i18n-(.+)-zh-cn$/, "luci-app-$1");
      packages.push(available.has(app) ? app : name);
    }
  }
  return { packages, theme, missing };
}
