const DEFAULT_HOME = "https://krumath.com/home";

export function krumathHomeUrl(): string {
  const origin = import.meta.env.VITE_KRUMATH_ORIGIN as string | undefined;
  if (origin && origin.length > 0) {
    return `${origin.replace(/\/$/, "")}/home`;
  }
  return DEFAULT_HOME;
}

/** Public path on krumath.com (Vite `base` + in-app route). */
export function publicGamePath(routerPath: string): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const path = routerPath === "/" ? "" : routerPath.startsWith("/") ? routerPath : `/${routerPath}`;
  return `${base}${path}` || "/";
}

export function signInUrl(returnPath: string): string {
  const path = returnPath.startsWith("/") ? returnPath : `/${returnPath}`;
  const query = `returnUrl=${encodeURIComponent(path)}`;
  const origin = import.meta.env.VITE_KRUMATH_ORIGIN as string | undefined;
  if (origin && origin.length > 0) {
    return `${origin.replace(/\/$/, "")}/sign-in?${query}`;
  }
  return `/sign-in?${query}`;
}
