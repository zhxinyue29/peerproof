"use client";

import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";

/// Ends Privy's own session, then reports back.
///
/// Signing out used to clear our derived key and unmount Privy, which looks complete and is not:
/// Privy keeps its session in browser storage, so the next email login found it already
/// authenticated, skipped the modal, and handed back the same account. "Use a different account"
/// returned you to the account you were trying to leave — and on a product where two people in a
/// room have to be two different accounts, that is not a cosmetic bug.
///
/// It has to be a component because `logout` is a hook, and hooks only work under PrivyProvider —
/// which is precisely the thing being torn down. So: mount this inside the provider, let it log
/// out, and only then unmount the provider.
export default function PrivyLogout({ onDone }: { onDone: () => void }) {
  const { ready, logout } = usePrivy();
  const fired = useRef(false);

  useEffect(() => {
    if (!ready || fired.current) return;
    fired.current = true;
    // Unmount regardless: a failed logout must not leave the session wedged with no way out. The
    // worst case is Privy remembering an account whose key we have already thrown away, and the
    // login modal will still be reachable after a reload.
    void logout().finally(onDone);
  }, [ready, logout, onDone]);

  return null;
}
