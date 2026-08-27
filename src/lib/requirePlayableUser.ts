import { createIsomorphicFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";

import { isPlayableUser } from "@/lib/authUser";
import { publicGamePath, signInUrl } from "@/lib/krumathUrls";

const getPlayableUser = createIsomorphicFn()
  .server(async () => {
    const { getServerUser } = await import("@/lib/supabase.server");
    return getServerUser();
  })
  .client(async () => {
    const { getBrowserUser } = await import("@/lib/supabase.client");
    return getBrowserUser();
  });

export async function requirePlayableUser(routerPath: string): Promise<void> {
  // Local play has no krumath.com cookies. Gate only in production.
  if (import.meta.env.DEV) return;

  const user = await getPlayableUser();
  if (!isPlayableUser(user)) {
    throw redirect({ href: signInUrl(publicGamePath(routerPath)) });
  }
}
