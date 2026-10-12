const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function withAppBasePath(pathname: string): string {
  if (
    !basePath ||
    pathname === basePath ||
    pathname.startsWith(`${basePath}/`)
  ) {
    return pathname;
  }

  return pathname.startsWith("/") ? `${basePath}${pathname}` : pathname;
}
