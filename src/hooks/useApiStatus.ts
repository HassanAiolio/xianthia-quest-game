import { useEffect, useState } from "react";

export interface ApiStatus {
  llm: boolean;
  images: boolean;
}

const OFFLINE: ApiStatus = { llm: false, images: false };
let pending: Promise<ApiStatus> | null = null;

/** Which server features are configured (keys present). Fetched once per page load. */
export function useApiStatus(): ApiStatus | null {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  useEffect(() => {
    pending ??= fetch("/api/status")
      .then((r) => (r.ok ? (r.json() as Promise<ApiStatus>) : OFFLINE))
      .catch(() => OFFLINE);
    let alive = true;
    pending.then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}
