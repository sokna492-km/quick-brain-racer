import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { getCookies, getRequest, getRequestHost, setCookie } from "@tanstack/react-start/server";

import { getKrumathSupabaseCookieOptions, mergeKrumathCookieOptions } from "@/lib/krumathCookies";

function supabaseUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) throw new Error("Missing VITE_SUPABASE_URL");
  return url;
}

function supabaseAnonKey(): string {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!key) throw new Error("Missing VITE_SUPABASE_ANON_KEY");
  return key;
}

export async function getServerUser(): Promise<User | null> {
  const request = getRequest();
  const hostname = getRequestHost({ xForwardedHost: true });
  const url = new URL(request.url);
  const cookieOptions = getKrumathSupabaseCookieOptions(hostname, url.protocol === "https:");
  const cookies = getCookies();

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return Object.entries(cookies).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          setCookie(name, value, mergeKrumathCookieOptions(options ?? {}, hostname));
        }
      },
    },
    ...(cookieOptions ? { cookieOptions } : {}),
  });

  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
