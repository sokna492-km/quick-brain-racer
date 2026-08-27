import { createBrowserClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

import { getKrumathSupabaseCookieOptions } from "@/lib/krumathCookies";

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

export async function getBrowserUser(): Promise<User | null> {
  const hostname = window.location.hostname;
  const cookieOptions = getKrumathSupabaseCookieOptions(
    hostname,
    window.location.protocol === "https:",
  );
  const supabase = createBrowserClient(
    supabaseUrl(),
    supabaseAnonKey(),
    cookieOptions ? { cookieOptions } : undefined,
  );
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
