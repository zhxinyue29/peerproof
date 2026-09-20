"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/// Where "back" goes.
///
/// It used to go wherever the link was hardcoded to — the event page's was `/events`, the
/// participant listing — so an organizer who opened their own event from the dashboard and pressed
/// back landed on a stranger's view of the directory. Back has to mean "the page I came from", and
/// only one thing knows that: the history stack.
///
/// The catch is that this app is often opened on a link that somebody was handed, at a venue door.
/// There is no previous page then, and `router.back()` leaves the browser on the same screen or
/// exits the site. So each caller declares its parent — the page that is one level up in the map —
/// and that is used whenever there is nothing to go back to.
///
/// "Is there anything to go back to" is counted rather than inferred. `document.referrer` does not
/// update on a client-side navigation, and `history.length` counts the whole tab including pages
/// from other sites. A counter this app increments itself, once per route change, is the only
/// thing that answers "did *we* navigate".
const KEY = "peerproof.nav.depth";

function depth(): number {
  try {
    return Number(sessionStorage.getItem(KEY) ?? "0");
  } catch {
    // Private browsing. Treat it as a fresh arrival, which sends back to the declared parent —
    // always a real page, never a dead end.
    return 0;
  }
}

/// Mounted once, at the root. Counts in-app navigations.
export function useTrackNavigation() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      // The first render is the arrival, not a navigation. Counting it would make "back" on the
      // very first page believe there is somewhere to return to.
      first.current = false;
      return;
    }
    try {
      sessionStorage.setItem(KEY, String(depth() + 1));
    } catch {
      /* nothing to do */
    }
  }, [pathname]);
}

/// A back control that prefers real history and falls back to the declared parent.
///
/// Returns an `href` as well as a handler, so the control stays a link: middle-click and
/// right-click still work, and it is still a link with JavaScript disabled.
export function useBack(parent: string) {
  const router = useRouter();
  return {
    href: parent,
    onClick: (e: React.MouseEvent) => {
      // Let the browser handle anything that is not a plain left click — a new tab should open the
      // parent rather than silently going back in this one.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      if (depth() > 0) {
        e.preventDefault();
        try {
          sessionStorage.setItem(KEY, String(depth() - 1));
        } catch {
          /* nothing to do */
        }
        router.back();
      }
    },
  };
}
