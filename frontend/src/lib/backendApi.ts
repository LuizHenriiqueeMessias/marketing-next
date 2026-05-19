const LOCAL_BACKEND_URL = "http://localhost:8000";

function normalizeBaseUrl(value: string | null | undefined) {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed ? trimmed : null;
}

function isPrivateHostname(hostname: string) {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1" || lower === "::1") return true;
  if (lower.endsWith(".local")) return true;
  if (/^10\./.test(lower)) return true;
  if (/^192\.168\./.test(lower)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(lower)) return true;
  return false;
}

function isPublicBaseUrl(base: string | null) {
  if (!base) return false;

  try {
    const parsed = new URL(base);
    return !isPrivateHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function pushCandidate(target: string[], value: string | null) {
  if (!value || target.includes(value)) return;
  target.push(value);
}

function pushWithApiVariants(target: string[], base: string | null) {
  if (!base) return;

  pushCandidate(target, base);
  if (base.endsWith("/api")) {
    pushCandidate(target, base.slice(0, -4));
  } else {
    pushCandidate(target, `${base}/api`);
  }
}

export function getBackendBaseCandidates() {
  const candidates: string[] = [];
  const envBase = normalizeBaseUrl(import.meta.env.VITE_API_URL);
  const browserOrigin =
    typeof window !== "undefined" ? normalizeBaseUrl(window.location.origin) : null;
  const isLocalBrowser =
    browserOrigin !== null &&
    /^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?$/i.test(browserOrigin);

  pushWithApiVariants(candidates, envBase);
  if (isLocalBrowser) {
    pushWithApiVariants(candidates, LOCAL_BACKEND_URL);
  }
  pushWithApiVariants(candidates, browserOrigin);

  return candidates;
}

export function getPreferredBackendBaseUrl() {
  return getBackendBaseCandidates()[0] ?? null;
}

export function getPublicBackendBaseUrl() {
  const envBase = normalizeBaseUrl(import.meta.env.VITE_API_URL);
  return isPublicBaseUrl(envBase) ? envBase : null;
}

function buildUrl(baseUrl: string, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export async function fetchBackend(path: string, init?: RequestInit) {
  const candidates = getBackendBaseCandidates();
  let lastError: unknown = null;

  for (const baseUrl of candidates) {
    const url = buildUrl(baseUrl, path);

    try {
      const response = await fetch(url, init);
      if (response.status === 404) {
        lastError = new Error(`HTTP 404 (${url})`);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Backend indisponivel");
}

export async function pingBackend() {
  try {
    await fetchBackend("/health");
  } catch {
    // keep-alive best effort
  }
}
