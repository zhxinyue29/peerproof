"use client";

import { useTrackNavigation } from "@/lib/back";

/// Mounted once at the root so `useBack` can tell an in-app navigation from an arrival.
///
/// A component rather than a call inside the layout because the layout is a server component and
/// this needs an effect.
export default function NavTracker() {
  useTrackNavigation();
  return null;
}
