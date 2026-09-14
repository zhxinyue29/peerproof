"use client";

import { useState } from "react";
import { useIdentity } from "@/components/IdentityProvider";
import { Button, CopyableCode, Notice } from "@/components/ui";
import { ESCROW_ADDRESS, explorerTxUrl } from "@/lib/chain";
import { attendanceEscrowBytecode } from "@/lib/escrowArtifact";
import { shortenError } from "@/lib/format";
import { walletDeploy } from "@/lib/wallet";

/// Deploys a fresh escrow from the browser. Dev-only, and deliberately awkward.
///
/// This exists because a contract change was blocked on a forgotten keystore password — something
/// with nothing to do with the change. A wallet already holds a key and already signs here, so a
/// click does the same job without the key ever leaving it.
///
/// It asks for confirmation because the consequence is not obvious: every event on the current
/// escrow is left behind. Deposits there are still claimable through the old address, but nothing
/// in this app will point at them again.
export default function DeployEscrow() {
  const { signer } = useIdentity();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ hash: string; address: string } | null>(null);

  if (!signer) return null;

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-warn/40 p-4">
      <div>
        <p className="text-[13px] font-medium text-warn">Dev · deploy a new escrow</p>
        <p className="mt-1.5 text-sm leading-relaxed text-dim">
          Current: <span className="font-mono text-[12px]">{ESCROW_ADDRESS}</span>
        </p>
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      {result ? (
        <div className="space-y-2">
          <Notice tone="ok">
            Deployed. Set this as ESCROW_ADDRESS in the build, then verify the source.
          </Notice>
          <CopyableCode value={result.address} tone="ok" />
          {explorerTxUrl(result.hash) && (
            <a
              href={explorerTxUrl(result.hash)}
              className="inline-block text-[13px] text-dim underline decoration-line-2"
            >
              deployment transaction
            </a>
          )}
        </div>
      ) : armed ? (
        <div className="space-y-2">
          <Notice tone="warn">
            Every event on the current escrow is left behind. Deposits there stay claimable at the
            old address, but nothing here will point at them again.
          </Notice>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setBusy(true);
                setError(null);
                void walletDeploy(signer.address, attendanceEscrowBytecode, 3_200_000n)
                  .then(setResult)
                  .catch((e) => setError(shortenError(e)))
                  .finally(() => setBusy(false));
              }}
              disabled={busy}
              variant="warn"
              className="flex-1"
            >
              {busy ? "Deploying…" : "Yes, deploy"}
            </Button>
            <Button onClick={() => setArmed(false)} variant="ghost" disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Button onClick={() => setArmed(true)} variant="ghost" className="w-full">
            Deploy a new escrow
          </Button>
          <p className="text-[11px] leading-relaxed text-faint">
            About 0.3 MON. The gas limit is pinned at 3,200,000 rather than estimated, because Monad
            charges the limit and not the amount used.
          </p>
        </>
      )}
    </div>
  );
}
