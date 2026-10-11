// DOM links already contain the deployment base; React Router adds it itself.
export function routerPath(
  path: string,
  base = import.meta.env.BASE_URL
): string {
  const prefix = base.replace(/\/$/, "");
  if (!prefix || prefix === "/") return path;
  if (path === prefix || path.startsWith(prefix + "?"))
    return "/" + path.slice(prefix.length);
  return path.startsWith(prefix + "/") ? path.slice(prefix.length) : path;
}
