const configuredApiBaseUrl =
  ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined)?.trim() || "";

const normalizedApiBaseUrl = configuredApiBaseUrl.replace(/\/+$/, "");

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return normalizedApiBaseUrl ? `${normalizedApiBaseUrl}${normalizedPath}` : normalizedPath;
}

export function getPublicApiOrigin(): string {
  return normalizedApiBaseUrl || window.location.origin;
}
