"use client";

import { useEffect, useMemo, useState } from "react";

/// The page's query string, as the browser has it — `null` until mount.
///
/// Same approach as the organizer page's `useUrlTab`, for the same reasons: under `output: export`
/// `useSearchParams` forces a Suspense boundary and ships a skeleton in the prerendered HTML, and the
/// export has no query string at all, so the first client render has to be the query-less one.
/// next/link pushes history without an event anybody outside the router can hear, hence the
/// interval; the browser's own back and forward come through `popstate`.
export function useUrlQuery(): URLSearchParams | null {
  const [search, setSearch] = useState<string | null>(null);

  useEffect(() => {
    // An unchanged string is an unchanged state, so the interval re-renders nothing while the URL
    // stays put.
    const read = () => setSearch(window.location.search);
    read();
    window.addEventListener("popstate", read);
    const id = setInterval(read, 300);
    return () => {
      window.removeEventListener("popstate", read);
      clearInterval(id);
    };
  }, []);

  return useMemo(() => (search === null ? null : new URLSearchParams(search)), [search]);
}
