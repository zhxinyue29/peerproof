# User validation

PeerProof's real-world evidence so far is one external micro-pilot on Monad testnet and two
retrospective participant interviews. This is early qualitative validation. It is not production
traction, and it is not statistically representative research.

## External micro-pilot

| | |
|---|---|
| Network | Monad testnet (chain ID 10143) |
| Contract | `AttendanceEscrow` at [`0xEa057c5a6F431eFF29F573E4db4bc49cD52Ee679`](https://testnet.monadscan.com/address/0xEa057c5a6F431eFF29F573E4db4bc49cD52Ee679) |
| Event | Event #2 |
| Participants | Two independent external participants |
| Deposit | 0.0100 MON each (testnet MON) |
| Result | One participant confirmed, one participant not confirmed |
| Settlement | Permissionless: `settle(2)` was sent by an ordinary participant account (the unconfirmed participant's), not by the organizer and not by an automated job |
| Claim | The confirmed participant claimed 0.0200 MON: their returned 0.0100 MON deposit plus the other participant's forfeited 0.0100 MON deposit |

Evidence: [Event #2 public record](https://zhxinyue29.github.io/peerproof/verify/?event=2) ·
[settle tx](https://testnet.monadscan.com/tx/0x8e151c79daf64e140b481f3d1f5639e43f2f01da5895c81f1882959bb65760bf) ·
[claim tx](https://testnet.monadscan.com/tx/0xcd58dbb46884debdc87d6c60091aa5ff6176d6731fea85233908dce759e3e3c9) ·
[source verified with Sourcify (`exact_match`)](https://repo.sourcify.dev/10143/0xEa057c5a6F431eFF29F573E4db4bc49cD52Ee679)

What the chain records (contract state read on 2026-09-30):

- Both participants registered and checked in against the venue beacon. The event required one
  received attestation (`k = 1`).
- One attestation was submitted: the confirmed participant scanned the other participant's code.
  An attestation adds to both parties' received count, but only the scanner is credited with having
  initiated one.
- The scanner therefore met both conditions for presence (at least `k` attestations received, at
  least one initiated) and was confirmed. The other participant had checked in and been scanned, so
  they had the one received attestation the event required, but they had not initiated an
  attestation. They did not satisfy the full attendance rule and were not confirmed. They were not a
  simple no-show: the contract's `noShows = 1` counts everyone who was not confirmed.
- With only two registrants there is one pair, and a pair can attest only once, so peer attestation
  alone could confirm at most one of the two. The second could only have been confirmed through the
  organizer fallback, which the contract opens when peers confirm `k` or fewer people. It was not
  used (`orgConfirmed = 0`).

This was a small testnet pilot, not a production event.

## Method

After the micro-pilot, the two participants each gave qualitative feedback in a retrospective
interview covering three questions:

1. Which step was hardest to understand?
2. Would they pay a refundable deposit for a real event?
3. Would they trust attendance proven by participants rather than decided by the organizer?

- They are referred to as **Participant A** and **Participant B**. The labels are not mapped to
  on-chain addresses, and this document does not say which of them was confirmed.
- The findings below are the project's summaries of what each participant said. Recordings and
  transcripts are not included in this repository.
- No demographic, occupational or background information is recorded here.

## Participant A findings

- They understood check-in and peer vouching as separate steps, but initially struggled to
  understand how peer attestations determine presence and trigger the deposit refund.
- They wanted clearer explanations of:
  - how many peer confirmations are required;
  - why peer verification is preferable to organizer-only confirmation;
  - how collusion is mitigated;
  - when, and under what conditions, the deposit is returned.
- For a real event, they would accept a refundable deposit of approximately USD $1–5 for a small,
  capacity-limited event, and would hesitate above USD $10 unless the event itself had substantial
  value.
- Their primary concerns were custody, refund conditions, refund timing, and failure handling.
- They conditionally preferred multiple independent participants plus public records over
  organizer-only control, but wanted the limits of collusion resistance explained honestly.

## Participant B findings

- They identified the most counterintuitive rule: receiving enough peer attestations is not
  sufficient unless the attendee has also initiated an attestation.
- In Event #2, the unconfirmed participant checked in and was scanned, but did not initiate an
  attestation, so they remained ineligible.
- They found the two rotating QR-code contexts easy to confuse:
  - the venue check-in code, which rotates every 30 seconds;
  - the participant vouching code, which rotates every 15 seconds.
- They were willing to place a small refundable deposit, but were concerned about losing it after
  physically arriving and then failing to complete the required interaction.
- They identified funding a wallet with testnet MON as another onboarding obstacle.
- They preferred deterministic contract settlement over organizer-only control, while recognizing:
  - the organizer fallback that very small events require;
  - that collusion remains possible;
  - that the venue beacon raises the cost of remote collusion but does not eliminate it.

## Findings

Taken together, the two interviews point to seven findings:

1. The deposit amount itself was not the main objection; unclear eligibility and refund conditions
   were.
2. "Received enough attestations" and "initiated at least one attestation" must be presented as
   separate requirements.
3. The venue QR code and the participant QR code need visibly different labels and purposes.
4. Users need a real-time eligibility checklist rather than only a vouch count.
5. Small-event limitations and the organizer fallback must be explained honestly.
6. Collusion resistance should be described as cost-raising, not absolute prevention.
7. Testnet or token funding remains a real onboarding limitation.

## Product implications

These are proposed improvements drawn from the findings. None of them is claimed as implemented.
Where today's interface already covers part of one, the note under it says what exists.

- **Separate status rows** for venue check-in, attestation initiated, peer confirmations received,
  and refund eligibility.
  *Today:* the attendance floor (`/floor`) shows "Checked in" with the time, a "vouched for you"
  count against `k`, and, until the attendee has vouched for someone, the warning "Scan at least one
  person — being vouched for isn't enough on its own." Initiating an attestation appears only as
  that warning, and there is no refund-eligibility row. Two existing lines still blur the two
  requirements: the pre-sign-in step "Take your deposit back" says you count as present once enough
  people have vouched for you, and the "already vouched" error tells the person who was scanned
  "One scan counts for both of you."
- **Visibly different labels** for the venue check-in QR code and the peer-vouching QR code.
- **Before registration, explain** who holds the deposit, when settlement happens, the refund
  conditions, and the branch in which every deposit is refunded because nobody could be confirmed.
  *Today:* the event page's rules and FAQ tabs explain check-in and vouching, what happens to the
  deposit, and the full refund when too few people register. The branch that refunds everyone when
  nobody can be confirmed is explained on the public record page (`/verify`), not before
  registration.
- **Warn that very small events may require the organizer fallback.**
  *Today:* the fallback is explained on the organizer's screen when it unlocks; attendees are not
  warned before they register.
- **Keep the no-wallet judge demo** while clearly separating it from the real Monad testnet flow.
  *Today:* the walkthrough (`/demo`) is labelled "Illustrative demo data" and "No transaction will
  be sent", and the illustrative proof on `/verify` states that no on-chain records stand behind it.

## Limitations

- Sample size: two participants.
- Convenience sample, not a random or representative one.
- Qualitative, retrospective interviews held after the pilot; the findings are the project's
  summaries, not transcripts.
- One external micro-pilot on testnet, not a production deployment. Deposits were testnet MON, so no
  real money was at stake; the USD amounts above are what a participant said they would accept at a
  real event.
- No claim of market traction, retention, conversion rate, or broad demand.
- The chain proves the actions of two addresses. That they belonged to two independent people is
  recorded from the pilot process and is not provable on chain.
