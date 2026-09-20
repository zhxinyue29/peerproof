"use client";

import { useEffect, useState } from "react";
import { useIdentity } from "@/components/IdentityProvider";
import { Button, Field, Notice } from "@/components/ui";
import { eventId } from "@/lib/chain";
import { shortenError } from "@/lib/format";
import { useT } from "@/lib/i18n";
import CoverField from "@/components/CoverField";
import {
  checkDirectory,
  deployDirectory,
  describeGas,
  directoryAddress,
  readListing,
} from "@/lib/directory";
import { eventDirectoryAbi } from "@/lib/directoryArtifact";

/// Writes the event's words after the fact.
///
/// The create form already sends a `describe` transaction, and the contract has always allowed it
/// to be sent again — "an organizer who writes something wrong fixes it by writing again." The app
/// did not offer that second chance, so when the description failed during creation the event was
/// stuck as "Event #1" on the listing page for good. Which is exactly what happened: the failure
/// was written to a notice the success card never rendered, so it was silent as well as permanent.
///
/// It also covers the ordinary case nobody had built for — a typo in a title, or a venue that
/// changed after the invitations went out.
export default function EditListing({ id = eventId() }: { id?: bigint }) {
  const { signer } = useIdentity();
  const t = useT();
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [url, setUrl] = useState("");
  const [venue, setVenue] = useState("");
  const [tags, setTags] = useState("");
  const [cover, setCover] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    void readListing(id)
      .then((l) => {
        if (!live) return;
        setTitle(l.title);
        setBlurb(l.blurb);
        setUrl(l.url);
        setVenue(l.venue);
        setTags(l.tags);
        setCover(l.cover);
      })
      .catch(() => {})
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [id]);

  async function save() {
    if (!signer) return;
    setBusy(t("listing.saving"));
    setError(null);
    setSaved(false);
    try {
      // The directory is deployed on demand. An organizer should never be asked to deploy a
      // contract, so this happens without being announced as anything other than saving.
      if (!(await checkDirectory())) {
        setBusy(t("listing.settingUp"));
        await deployDirectory(signer.sendRaw);
      }
      setBusy(t("listing.saving"));
      await signer.write({
        functionName: "describe",
        // One named struct, not six positional strings. The positional form is what let two call
        // sites keep passing five arguments after the function grew a sixth.
        args: [id, { title, blurb, url, venue, tags, cover }],
        gas: describeGas(title, blurb, url, venue, tags, cover),
        to: directoryAddress(),
        abi: eventDirectoryAbi,
      });
      setSaved(true);
    } catch (e) {
      setError(shortenError(e, t));
    } finally {
      setBusy(null);
    }
  }

  if (!signer || !loaded) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-panel p-4 md:p-5">
      <div>
        <p className="text-[16px] font-medium">{t("listing.whatPeopleSee")}</p>
        <p className="mt-1 text-[15px] leading-relaxed text-dim">
          {title ? t("listing.editHint") : t("listing.noTitleHint")}
        </p>
      </div>

      {error && <Notice tone="bad">{error}</Notice>}
      {saved && <Notice tone="ok">{t("listing.saved")}</Notice>}

      <Field
        label={t("listing.title")}
        value={title}
        onChange={setTitle}
        hint={t("listing.titleHint")}
      />
      <label className="block">
        <span className="text-[14px] font-medium uppercase tracking-wider text-faint">
          {t("listing.description")}
        </span>
        <textarea
          value={blurb}
          onChange={(e) => setBlurb(e.target.value)}
          rows={3}
          placeholder={t("listing.blurbPlaceholder")}
          className="mt-1.5 w-full resize-y rounded-xl border border-line-2 bg-ink px-3 py-2.5 text-[16px] outline-none placeholder:text-faint focus:border-accent"
        />
      </label>
      {/* Where it happens. Added with the contract field: an attendance product that cannot say
          where attendance happens is missing its subject, and it is the first question anybody has
          before staking a deposit. Free text — "Kaiyuan Space, Singapore", "Online" — because the
          contract decides nothing about it and the worst a bad string can do is read badly. */}
      <Field
        label={t("listing.venue")}
        value={venue}
        onChange={setVenue}
        hint={t("listing.venueHint")}
      />
      {/* Comma-separated, and the contract stores exactly the string typed — no parsing on the way
          in. Splitting into a token list would mean deciding what a tag is, and the moment that
          decision lives on chain it cannot be revised without a migration. The search box on the
          events page reads this the same way a person does. */}
      <Field
        label={t("listing.tags")}
        value={tags}
        onChange={setTags}
        hint={t("listing.tagsHint")}
      />
      <CoverField value={cover} onChange={setCover} />
      <Field
        label={t("listing.link")}
        value={url}
        onChange={setUrl}
        hint={t("listing.linkHint")}
      />

      <Button onClick={() => void save()} disabled={!!busy} className="w-full">
        {busy ?? (title ? t("common.save") : t("listing.addTitle"))}
      </Button>
    </section>
  );
}
