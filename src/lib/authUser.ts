import type { User } from "@supabase/supabase-js";

export function isPlayableUser(user: User | null): boolean {
  if (!user) return false;
  if (user.is_anonymous) return false;
  return true;
}
