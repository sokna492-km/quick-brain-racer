/** Cookie options compatible with @supabase/ssr (same rules as KruMath). */
export type KrumathSupabaseCookieOptions = {
  domain?: string;
  path?: string;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
};

export function getKrumathCookieDomain(hostname: string | undefined | null): string | undefined {
  if (!hostname) return undefined;
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return undefined;
  if (host.endsWith("krumath.com")) return ".krumath.com";
  return undefined;
}

export function getKrumathSupabaseCookieOptions(
  hostname: string | undefined | null,
  secure = true,
): KrumathSupabaseCookieOptions | undefined {
  const domain = getKrumathCookieDomain(hostname);
  if (!domain) return undefined;
  return { domain, path: "/", sameSite: "lax", secure };
}

export function mergeKrumathCookieOptions<T extends { domain?: string }>(
  options: T,
  hostname: string | undefined | null,
): T {
  const domain = getKrumathCookieDomain(hostname);
  if (!domain) return options;
  return { ...options, domain };
}
