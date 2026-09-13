"use client";

import { useState } from "react";
import { useIdentity } from "@/components/IdentityProvider";
import { Button, CopyableCode, Notice } from "@/components/ui";
import { deployDirectory, hasDirectory } from "@/lib/directory";
import { ESCROW_ADDRESS, explorerTxUrl } from "@/lib/chain";
import { shortenError } from "@/lib/format";

/// One-time setup, shown only while the directory is unconfigured.
///
/// It exists because the alternative — a keystore file and a password typed into a terminal — is
/// what actually blocked this from being deployed. The wallet already holds the key; deploying is
/// just a transaction with no `to` address, so a click does the same job as a password, without
/// the key ever leaving the wallet.
export default function DeployDirectory() {
  const { signer } = useIdentity();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ hash: string; address: string } | null>(null);

  if (hasDirectory || !signer) return null;

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-line-2 p-4">
      <div>
        <p className="text-[15px] font-medium">Event descriptions aren&apos;t set up yet</p>
        <p className="mt-1 text-sm leading-relaxed text-dim">
          Titles and blurbs live in a second contract, so the one holding deposits never has to
          change to store text. Deploy it once and every event after this can describe itself.
        </p>
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      {result ? (
        <div className="space-y-2">
          <Notice tone="ok">Deployed. Add this to the build configuration.</Notice>
          <CopyableCode value={`NEXT_PUBLIC_DIRECTORY_ADDRESS=${result.address}`} tone="ok" />
          {explorerTxUrl(result.hash) && (
            <a
              href={explorerTxUrl(result.hash)}
              className="inline-block text-[13px] text-dim underline decoration-line-2"
            >
              deployment transaction
            </a>
          )}
        </div>
      ) : (
        <>
          <Button
            onClick={() => {
              setBusy(true);
              setError(null);
              void deployDirectory(signer.address, ESCROW_ADDRESS)
                .then(setResult)
                .catch((e) => setError(shortenError(e)))
                .finally(() => setBusy(false));
            }}
            disabled={busy}
            className="w-full"
          >
            {busy ? "Deploying…" : "Deploy the directory"}
          </Button>
          <p className="text-[11px] leading-relaxed text-faint">
            About 0.12 MON. The gas limit is pinned at 1,300,000 rather than estimated, because
            Monad charges the limit and not the amount used.
          </p>
        </>
      )}
    </div>
  );
}
