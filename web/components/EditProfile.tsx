"use client";

import { useEffect, useState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { useIdentity } from "@/components/IdentityProvider";
import DeployDirectory from "@/components/DeployDirectory";
import { directoryAddress, directoryReady } from "@/lib/directory";
import { eventDirectoryAbi } from "@/lib/directoryArtifact";
import {
  EMPTY_PROFILE,
  profileGas,
  profileUnchanged,
  readProfile,
  type Profile,
} from "@/lib/directory";
import { mon, shortenError } from "@/lib/format";
import { publicClient } from "@/lib/chain";
import { useT } from "@/lib/i18n";

/// What this account says about itself, written to a contract that holds no money.
///
/// Three things this form does that a profile form usually does not, all because writing costs gas:
///
///   · it saves on a button, never on a keystroke — autosave here would charge for every character
///   · it compares first, and refuses to send when nothing changed, rather than charging for a
///     no-op because somebody pressed save twice
///   · it says what the write will cost before it is sent, so the wallet prompt is not the first
///     time the price appears
///
/// Nothing here is required. An account with an empty profile is a complete account; the page it
/// feeds is about what somebody can prove, and none of that comes from this form.
type Draft = Omit<Profile, "updatedAt">;

const BLANK: Draft = { name: "", bio: "", city: "", x: "", github: "", website: "" };

export default function EditProfile({ onSaved }: { onSaved?: (p: Profile) => void } = {}) {
  const t = useT();
  const { signer } = useIdentity();
  const [onChain, setOnChain] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /// Flipped by the deploy block below. `directoryReady()` is a module-level cache written when
  /// somebody asks the chain, and nothing re-asks after a successful deploy — so the warning
  /// stayed on screen above a green "deployed" notice, on the same screen, at the same time.
  const [justDeployed, setJustDeployed] = useState(false);

  useEffect(() => {
    if (!signer?.address) return;
    let dropped = false;
    void readProfile(signer.address)
      .then((p) => {
        if (dropped) return;
        setOnChain(p);
        setDraft({ name: p.name, bio: p.bio, city: p.city, x: p.x, github: p.github, website: p.website });
      })
      .catch(() => {
        if (!dropped) setOnChain(EMPTY_PROFILE);
      });
    return () => {
      dropped = true;
    };
  }, [signer?.address]);

  const set = (k: keyof Draft) => (v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setSaved(false);
  };

  const unchanged = onChain ? profileUnchanged(draft, onChain) : true;
  const gas = profileGas(draft);

  async function save() {
    if (!signer || unchanged) return;
    setBusy(t("profile.saving"));
    setError(null);
    try {
      const hash = await signer.write({
        functionName: "setProfile",
        args: [draft.name, draft.bio, draft.city, draft.x, draft.github, draft.website],
        gas,
        to: directoryAddress(),
        abi: eventDirectoryAbi,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(t("event.revertedOnChain"));
      const fresh = { ...draft, updatedAt: BigInt(Math.floor(Date.now() / 1000)) };
      setOnChain(fresh);
      setSaved(true);
      // The page around this form shows the name and bio in its banner, and it read them once on
      // mount. Without this, saving worked, said so, and the banner above it kept showing the
      // address — you had to reload to see your own name, which reads as the save not having
      // taken.
      onSaved?.(fresh);
    } catch (e) {
      setError(shortenError(e, t));
    } finally {
      setBusy(null);
    }
  }

  if (!directoryReady() && !justDeployed) {
    // The directory has never been deployed, so there is nowhere to put this yet. Said plainly
    // rather than rendering a form whose save button could only fail.
    //
    // With the way out attached. The notice on its own named a thing that had to happen and gave
    // no means of making it happen — the deploy button existed, on the organizer dashboard, which
    // is not a page somebody filling in their own profile has any reason to visit. The component
    // renders nothing once the contract is there, so this costs an ordinary reader nothing.
    return (
      <div className="space-y-4">
        <Notice tone="warn">{t("profile.noDirectory")}</Notice>
        <DeployDirectory onDeployed={() => setJustDeployed(true)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[15px] leading-relaxed text-dim">{t("profile.intro")}</p>

      <Field label={t("profile.name")} value={draft.name} onChange={set("name")} hint={t("profile.nameHint")} />

      <label className="block">
        <span className="text-[14px] font-medium text-dim">{t("profile.bio")}</span>
        <textarea
          value={draft.bio}
          onChange={(e) => set("bio")(e.target.value)}
          rows={3}
          maxLength={280}
          placeholder={t("profile.bioHint")}
          className="mt-1.5 w-full resize-y rounded-xl border border-line-2 bg-ink px-3 py-2.5 text-[16px] outline-none placeholder:text-faint focus:border-accent"
        />
      </label>

      <Field label={t("profile.city")} value={draft.city} onChange={set("city")} hint={t("profile.cityHint")} />
      <Field label="X" value={draft.x} onChange={set("x")} hint={t("profile.handleHint")} />
      <Field label="GitHub" value={draft.github} onChange={set("github")} hint={t("profile.handleHint")} />
      <Field label={t("profile.website")} value={draft.website} onChange={set("website")} hint={t("profile.websiteHint")} />

      {error && <Notice tone="bad">{error}</Notice>}
      {saved && <Notice tone="ok">{t("profile.saved")}</Notice>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={!!busy || unchanged}>
          {busy ?? (unchanged ? t("profile.noChanges") : t("common.save"))}
        </Button>
        {/* The price before the prompt, not after. A wallet dialog is a bad place to learn what
            something costs, and this is the only screen in the product that charges for typing. */}
        {!unchanged && (
          <span className="text-[14px] text-faint">
            {t("profile.costs", { amount: mon(gas * 102_000_000_000n) })}
          </span>
        )}
      </div>
    </div>
  );
}
