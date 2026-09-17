"use client";

import { useEffect, useState } from "react";
import { useIdentity } from "@/components/IdentityProvider";
import { Button, Field, Notice } from "@/components/ui";
import { eventId } from "@/lib/chain";
import { shortenError } from "@/lib/format";
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
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [url, setUrl] = useState("");
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
      })
      .catch(() => {})
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [id]);

  async function save() {
    if (!signer) return;
    setBusy("Saving…");
    setError(null);
    setSaved(false);
    try {
      // The directory is deployed on demand. An organizer should never be asked to deploy a
      // contract, so this happens without being announced as anything other than saving.
      if (!(await checkDirectory())) {
        setBusy("Setting up descriptions…");
        await deployDirectory(signer.address);
      }
      setBusy("Saving…");
      await signer.write({
        functionName: "describe",
        args: [id, title, blurb, url],
        gas: describeGas(title, blurb, url),
        to: directoryAddress(),
        abi: eventDirectoryAbi,
      });
      setSaved(true);
    } catch (e) {
      setError(shortenError(e));
    } finally {
      setBusy(null);
    }
  }

  if (!signer || !loaded) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-panel p-4 md:p-5">
      <div>
        <p className="text-[16px] font-medium">What people see in the listing</p>
        <p className="mt-1 text-[15px] leading-relaxed text-dim">
          {title
            ? "Change this whenever you like. It is stored separately from the deposits and cannot affect them."
            : "This event has no title yet, so it shows as a number on the events page. Adding one costs a small amount of gas and nothing else."}
        </p>
      </div>

      {error && <Notice tone="bad">{error}</Notice>}
      {saved && <Notice tone="ok">Saved. The events page will show it within a few seconds.</Notice>}

      <Field label="Title" value={title} onChange={setTitle} hint="e.g. Thursday reading group" />
      <label className="block">
        <span className="text-[13px] font-medium uppercase tracking-wider text-faint">
          Description
        </span>
        <textarea
          value={blurb}
          onChange={(e) => setBlurb(e.target.value)}
          rows={3}
          placeholder="Who it's for, what happens, where."
          className="mt-1.5 w-full resize-y rounded-xl border border-line-2 bg-ink px-3 py-2.5 text-[16px] outline-none placeholder:text-faint focus:border-accent"
        />
      </label>
      <Field label="Link (optional)" value={url} onChange={setUrl} hint="A fuller page, if you have one" />

      <Button onClick={() => void save()} disabled={!!busy} className="w-full">
        {busy ?? (title ? "Save" : "Add a title")}
      </Button>
    </section>
  );
}
