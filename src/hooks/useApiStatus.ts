import { useEffect, useState } from "react";

export interface ApiStatus {
  /** The /api server answered at all (false on a static-only deploy). */
  reachable: boolean;
  llm: boolean;
  images: boolean;
}

const OFFLINE: ApiStatus = { reachable: false, llm: false, images: false };
let pending: Promise<ApiStatus> | null = null;

/** Which server features are configured (keys present). Fetched once per page load. */
export function useApiStatus(): ApiStatus | null {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  useEffect(() => {
    pending ??= fetch("/api/status")
      .then(async (r) => (r.ok ? { ...(await r.json()), reachable: true } : OFFLINE))
      .catch(() => OFFLINE);
    let alive = true;
    pending.then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}
