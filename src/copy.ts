export type PluginLocale = "zh" | "en";

export type PluginCopy = Record<string, string>;

/**
 * Resolve copy owned by the mounted package without letting the host invent
 * vehicle-specific translations. English values use the manifest's explicit
 * `<key>En` convention; missing entries fall back to a short, domain-safe
 * string so a partially translated package remains usable.
 */
export function localizedCopy(
  locale: PluginLocale,
  copy: PluginCopy | undefined,
  key: string,
  fallbackZh: string,
  fallbackEn = fallbackZh,
): string {
  const configuredKey = locale === "en" ? `${key}En` : key;
  const configured = copy?.[configuredKey];
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  return locale === "en" ? fallbackEn : fallbackZh;
}

