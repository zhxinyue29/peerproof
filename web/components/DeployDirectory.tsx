"use client";

import { useEffect, useState } from "react";
import { useIdentity } from "@/components/IdentityProvider";
import { Button, CopyableCode, Notice } from "@/components/ui";
import { checkDirectory, deployDirectory } from "@/lib/directory";
import { explorerTxUrl } from "@/lib/chain";
import { shortenError } from "@/lib/format";
import { useT } from "@/lib/i18n";

/// One-time setup, shown only while the directory is unconfigured.
///
/// It exists because the alternative — a keystore file and a password typed into a terminal — is
/// what actually blocked this from being deployed. The wallet already holds the key; deploying is
/// just a transaction with no `to` address, so a click does the same job as a password, without
/// the key ever leaving the wallet.
export default function DeployDirectory({ onDeployed }: { onDeployed?: () => void } = {}) {
  const { signer } = useIdentity();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ hash: string; address: string } | null>(null);

  // A chain read, so it is unknown on the first render — render nothing rather than flashing a
  // deploy prompt at somebody whose directory already exists.
  const [exists, setExists] = useState<boolean | null>(null);
  useEffect(() => {
    void checkDirectory().then(setExists);
  }, []);

  if (exists !== false || !signer) return null;

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-line-2 p-4">
      <div>
        <p className="text-[15px] font-medium text-dim">{t("deploy.dirTitle")}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-dim">
          {t("deploy.dirBody")}
        </p>
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      {result ? (
        <div className="space-y-2">
          <Notice tone="ok">{t("deploy.dirDone")}</Notice>
          <CopyableCode value={result.address} tone="ok" />
          {explorerTxUrl(result.hash) && (
            <a
              href={explorerTxUrl(result.hash)}
              className="inline-block text-[15px] text-dim underline decoration-line-2"
            >
              {t("deploy.dirTx")}
            </a>
          )}
        </div>
      ) : (
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setBusy(true);
              setError(null);
              void deployDirectory(signer.sendRaw)
                .then((r) => {
                  setResult(r);
                  onDeployed?.();
                })
                .catch((e) => setError(shortenError(e, t)))
                .finally(() => setBusy(false));
            }}
            disabled={busy}
            className="w-full"
          >
            {busy ? t("deploy.dirBusy") : t("deploy.dirCta")}
          </Button>
          <p className="text-[14px] leading-relaxed text-faint">{t("deploy.dirGas")}</p>
        </>
      )}
    </div>
  );
}
