# PeerProof Design V3 — Full UI System

This version replaces the previous “show everything at once” approach with progressive disclosure. The interface should feel easy to use before it feels technical.

## 1. Experience principles

1. **Action first, explanation on demand.** Every screen has one primary job. Supporting rationale appears only when relevant via accordions, bottom sheets, contextual notices, or post-action feedback.
2. **Important means visible, not verbose.** Deposit + `Held by the contract. Not by the organizer.` stay together. Proof, speed, money, and status use strong hierarchy.
3. **Evidence is the visual language.** Transaction hashes, rotating timers, proof graphs and real confirmation latency create the technical feeling. Avoid decorative “Web3” clutter.
4. **Dark, but not dim.** Canvas remains dark for venue use, while text contrast is materially higher than V2.
5. **Friendly utility.** Event imagery/visual blocks, human counts, live pulse and lightweight network motifs add interest without obscuring tasks.

## 2. Typography & accessibility

- Desktop body: **16 px minimum**.
- Desktop metadata/captions: **14 px minimum**; do not use low-contrast grey for essential information.
- Mobile body: **16 px**.
- Page title: **34 px desktop / 28 px mobile**.
- Key evidence numbers: **32–66 px** depending on context.
- Primary text: `#F7F9FD`.
- Secondary text: `#C5CEDB`.
- Muted text: `#9BA8BA` only for truly optional metadata.
- Touch target: **44 px minimum**.

## 3. Color semantics

- Purple: brand and primary action.
- Green: **objectively verified / already confirmed**, not generic “success”.
- Amber: attention or required next step; not necessarily an error.
- Red: actual blocker / unavailable path.
- Surfaces use deep navy rather than pure black so cards and text remain readable in poor ambient light.

## 4. Participant flow

### `/` — Home
Only three things are primary: the product proposition, the peer-proof visual, and the two equally weighted doors. Detailed mechanism explanation is intentionally absent from the first viewport.

### `/events` — Event discovery
Cards are visual first: event visual, title, time, place, deposit and registration count. “Open now” is promoted because it is actionable. Past events remain available as public evidence but are visually secondary.

### `/event` — Event detail
The first decision unit is: **event → 10 MON → held by contract → Join**. Attendance rules, deposit logic and proof details are expandable. Sign-in methods are not shown until the user chooses Join.

### Join identity sheet
Identity choices appear only at the moment they are needed. Passkey is recommended on compatible phones, email second, wallet third.

### Registration success
A one-time post-transaction sheet proves where the money went and what happens next. No celebration effect.

### `/floor`
Instrument mode. QR, timer, two actions and progress dominate. Explanation is optional.

### Vouch success
A transient result card makes the real on-chain latency the hero (`0.42s`), shows both counters moving, then gets out of the way before the next code rotation.

### `/verify`
The proof graph and settlement calculation share the screen. Every claim can lead to a transaction.

### Funding
Treated as a normal next step, not a red error screen. Transfer address + QR is the primary path.

### Payout
Money and evidence dominate. No confetti.

## 5. Organizer flow

### `/organizer` — Dashboard
The organizer first sees their own events and live operational state. The escrow KPI always carries `not in your wallet`. Payouts remain intentionally non-actionable.

### Create event — Step 1: About
Only public-facing event information is shown. The organizer does not face financial/timing configuration before describing the event.

### Create event — Step 2: Rules
Immutable financial and attendance rules are grouped together. A timeline makes doors-open, duration and walk-ins understandable without reading a paragraph.

### Created / beacon handoff
The one-time beacon key gets a dedicated credential screen with copy + QR setup paths. It must not resemble a normal share QR.

### `/venue`
Spatial mode. Huge QR, huge countdown, minimal chrome. It expands from phone to projector rather than being locked to a desktop card layout.

## 6. Screen set

Each screen includes a 390×844 mobile render and a 1280×900 desktop render unless the product intentionally constrains layout.

- `00-home`
- `01-events`
- `02-event`
- `02b-event-join-sheet`
- `03-event-signed-in`
- `03b-registration-success`
- `04-organizer-dashboard`
- `05-organizer-new-about`
- `05b-organizer-new-rules`
- `05c-organizer-created`
- `06-floor`
- `06b-floor-locked`
- `06c-floor-vouch-success`
- `07-venue`
- `07b-venue-setup`
- `08-verify`
- `09-funding`
- `10-payout`
- `11-identity-wallet`
- `12-identity-none`
- `13-identity-email`
- `14-privy-modal` (reference styling only; layout remains third-party controlled)

## 7. Implementation note

The HTML files in `html/` are design prototypes for implementation reference, not production code. They preserve existing routes and product constraints while changing hierarchy, progressive disclosure and component styling.
