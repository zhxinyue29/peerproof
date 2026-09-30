# User validation

PeerProof's user evidence so far comes from three separate activities, each reported in its own
section:

1. **External micro-pilot:** Event #2 on Monad testnet, with two independent external participants.
2. **Qualitative interviews:** two retrospective participant interviews after the pilot.
3. **Anonymous UX survey:** a closed-question survey answered by six anonymous respondents after
   they tried the demo.

Whether any survey respondent also took part in the pilot or the interviews has not been confirmed,
so this document gives no combined participant count. All of it is early, small-sample evidence:
not production traction or product-market fit, and not statistically representative research.

The interface was changed afterwards in response. Those changes are listed under
[Post-research product changes](#post-research-product-changes); they are not further validation, and the updated interface has
not yet been revalidated with users.

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

### Limitations of the pilot

- One external micro-pilot on testnet, not a production deployment. Deposits were testnet MON, so
  no real money was at stake.
- The chain proves the actions of two addresses. That they belonged to two independent people is
  recorded from the pilot process and is not provable on chain.
- No claim of market traction, retention, conversion rate, or broad demand.

## Qualitative interviews

### Method

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

### Participant A findings

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

### Participant B findings

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

### Findings

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

### Product implications

These began as proposals drawn from the findings. Each note records what the interface showed when
the research was done and, where a change followed, what it was and on which page. The changes are
not user validation: nobody has used the updated interface yet (see
[Post-research product changes](#post-research-product-changes)).

- **Separate status rows** for venue check-in, attestation initiated, peer confirmations received,
  and refund eligibility.
  *At the time of the research:* the attendance floor (`/floor`) showed "Checked in" with the time,
  a "vouched for you" count against `k`, and, until the attendee had vouched for someone, the
  warning "Scan at least one person — being vouched for isn't enough on its own." Initiating an
  attestation appeared only as that warning, and there was no refund-eligibility row. Two lines
  blurred the two requirements: the pre-sign-in step "Take your deposit back" said you count as
  present once enough people have vouched for you, and the "already vouched" error told the person
  who was scanned "One scan counts for both of you."
  **Implemented after the pilot and survey** (`/floor`): four status rows — venue check-in,
  attestation initiated, peer confirmations received against `k`, and deposit outcome — above the
  rule "To count as present, check in at the venue, initiate at least one attestation, and receive
  the required peer confirmations." Both blurring lines were reworded to say that a scan counts for
  both people but only the scanner has vouched for someone.
- **Visibly different labels** for the venue check-in QR code and the peer-vouching QR code.
  *At the time of the research:* the scanner's header said only "Point at the screen at the door" or
  "Point at someone's code", and the venue display was headed "Venue beacon"; neither code was named
  as a check-in or an attestation code.
  **Implemented after the pilot and survey** (scanner, `/floor`, `/venue`): "Venue check-in code —
  shown on the venue display, rotates every 30 seconds" and "Participant attestation code — shown on
  another participant's phone, rotates every 15 seconds", each with its own glyph and colour.
- **Before registration, explain** who holds the deposit, when settlement happens, the refund
  conditions, and the branch in which every deposit is refunded because nobody could be confirmed.
  *At the time of the research:* the event page showed "Held by the contract. Not by the
  organizer." under the deposit, and its rules and FAQ tabs explained check-in and vouching, what
  happens to the deposit, and the full refund when too few people register. The branch that refunds
  everyone when nobody can be confirmed was explained only on the public record page (`/verify`).
  **Implemented after the pilot and survey** (`/event`): an always-visible "Eligibility and
  refunds" list under "How it's verified" covering custody, the three attendance conditions, how one
  scan counts for both people, settlement by anyone once the window closes, the payout, and both
  full-refund branches.
- **Warn that very small events may require the organizer fallback.**
  *At the time of the research:* the fallback was explained on the organizer's screen when it
  unlocked; attendees were not warned before registering.
  **Implemented after the pilot and survey** (`/event`): a note that very small rooms may need the
  fallback, that in a two-person room peer-only verification may not confirm everyone, when the
  fallback opens, and that it gives the organizer no way to take a deposit.
- **Keep the no-wallet judge demo** while clearly separating it from the real Monad testnet flow.
  Already true at the time of the research and unchanged: the walkthrough (`/demo`) is labelled
  "Illustrative demo data" and "No transaction will be sent", and the illustrative proof on
  `/verify` states that no on-chain records stand behind it. Its graph legend now also opens with
  "Illustrative data."
  **Implemented after the pilot and survey** (`/demo`, `/verify`): the demo's last step now leads
  first to the verified Event #2 record, labelled as a real on-chain record on Monad testnet, and
  second to the illustrative proof, which links back to Event #2 at its top and foot.

### Limitations of the interviews

- Sample size: two participants.
- Convenience sample, not a random or representative one.
- Qualitative, retrospective interviews held after the pilot; the findings are the project's
  summaries, not transcripts.
- The USD amounts above are what a participant said they would accept at a real event; the pilot's
  deposits were testnet MON.
- No claim of market traction, retention, conversion rate, or broad demand.
- The interface was changed after the interviews (see [Post-research product changes](#post-research-product-changes));
  neither participant has used the updated version.

## Anonymous UX Survey / 匿名用户体验问卷

### Summary

We collected a closed-question UX survey from six anonymous respondents after they tried the
PeerProof demo. Five of the six had participated in or organized offline events, and all five of
those respondents had encountered event no-shows at least rarely.

Five of six respondents said they at least mostly understood the attendance-verification flow, with
a mean comprehension score of 3.17/5. The public verification graph was the most frequently selected
source of confusion (4/6), followed by deposit refund and settlement (3/6).

No respondent selected "No deposit." Four selected a refundable deposit of $5 or more, while one
said the acceptable amount would depend on the event. Four of six selected Trust for peer-based
attendance verification, and the remaining two were Neutral.

The leading concerns were fund safety (3/6) and collusion or fake attestations (2/6). Five of six
said they would probably or definitely try PeerProof at a real small event. All six reported
completing the demo within three minutes.

These findings provide early directional support for the product concept while identifying clear
priorities: explain the verification graph, settlement and refund conditions, fund custody and
collusion safeguards more clearly. This was a six-person convenience sample and should not be
interpreted as production traction or product-market fit.

### 中文摘要

参与者试用 PeerProof 演示后，我们收集了 6 位匿名受访者的封闭式用户体验问卷。6 人中有 5 人参加过或组织过线下活动，这 5 人都至少偶尔遇到过报名后不到场的情况。

6 人中有 5 人表示至少基本理解到场验证流程，理解程度平均为 3.17/5。最常被选为难以理解的是公开验证图（4/6），其次是押金退还与结算（3/6）。

没有人选择不交押金。4 人选择了 5 美元或以上的可退还押金，1 人表示要看具体活动。6 人中有 4 人对参与者互证表示信任，其余 2 人持中立态度，没有人表示不信任。

最主要的担忧是资金安全（3/6）和合谋或虚假作证（2/6）。6 人中有 5 人表示可能或一定会在真实的小型活动中尝试 PeerProof。6 人都自报在三分钟内完成了演示。

这些结果为产品概念提供了早期、方向性的支持，也指出了明确的改进重点：把验证图、结算与退款条件、资金托管和防合谋措施讲得更清楚。这只是 6 人的便利样本，不能解读为生产环境的 traction 或产品市场匹配。

### Method and scope

- Six anonymous respondents answered a closed-question UX survey after trying the PeerProof demo.
- The survey as actually administered had 11 closed questions:
  1. Experience of taking part in or organizing offline events (线下活动参与或组织经验)
  2. Whether they had met people who registered and then did not show up (是否遇到报名后未到场)
  3. How well they understood how PeerProof decides attendance, 1–5 (对 PeerProof 到场判断机制的理解程度)
  4. The hardest part to understand, multiple choice (最难理解的部分，可多选)
  5. The refundable deposit they would accept (可接受的可退还押金)
  6. How far they trust attendance proven by other participants, 1–5 (对参与者互证的信任程度)
  7. Their biggest concern, single choice (最大担忧，单选)
  8. Whether they would try it at a real small event (是否愿意在真实小型活动中尝试)
  9. How long the demo took them, self-reported (自报 Demo 完成时间)
  10. The description closest to them (最接近的身份)
  11. Their crypto wallet experience (加密钱包使用经验)
- There were no open-ended questions, and the survey did not ask which part was most valuable or
  what to improve first, so neither is reported here.
- The survey did not ask about respondents' relationship to the project, and this document does not
  describe them as external or independent.
- Results are reported in aggregate only. Names, contact details, screenshots, timestamps and
  row-level response combinations are not published.
- Data note: in two responses (R3 and R6) the pasted answer to Q3 was misaligned, but the written
  label in both reads "4 比较清楚 / Clearly", so both are recorded as 4.

### Respondent profile

| Question | Answer | Respondents |
|---|---|---|
| Offline event experience (Q1) | Participated only | 3 |
| | Organized and participated | 2 |
| | Neither | 1 |
| Closest description (Q10) | Student | 2 |
| | Web3 user | 2 |
| | Event attendee | 1 |
| | Community organizer | 1 |
| Crypto wallet experience (Q11) | Never used a wallet | 4 |
| | Use a wallet regularly | 2 |

Five of six had participated in or organized offline events. The survey did not ask how often, so
they should not be read as regular event attendees.

### Aggregate results

Counts are respondents out of six.

**Q2 · Had met registered attendees who did not show up**

| Answer | Respondents |
|---|---|
| Sometimes | 3 |
| Rarely | 2 |
| Never | 1 |

Five of six had encountered no-shows at least rarely. More precisely, all five respondents with
event participation or organizing experience reported encountering no-shows at least rarely. The
problem was familiar within this small sample; this does not show how common no-shows are in the
wider market.

**Q3 · Understanding of how PeerProof decides attendance (1–5)**

| Score | Respondents |
|---|---|
| 5 · Very clearly | 0 |
| 4 · Clearly | 2 |
| 3 · Mostly | 3 |
| 2 | 1 |
| 1 | 0 |

Mean 3.17/5. Five of six selected Mostly or Clearly.

**Q4 · Hardest part to understand (multiple choice)**

| Answer | Respondents |
|---|---|
| The public verification graph | 4 |
| Deposit refund and settlement | 3 |
| Everything was clear | 2 |
| Any other listed option | 0 |

The core flow was broadly understandable in this sample, but no respondent selected Very clearly.
The public verification graph and the connection between verification, settlement and refund
remain the clearest UX gaps.

**Q5 · Acceptable refundable deposit**

| Answer | Respondents |
|---|---|
| About $1 | 1 |
| About $5 | 1 |
| About $10 | 2 |
| More than $10 | 1 |
| Depends on the event | 1 |
| No deposit | 0 |

No respondent selected "No deposit." Four of six selected $5 or more, while one said the acceptable
amount would depend on the event.

**Q6 · Trust in peer attestation (1–5)**

| Score | Respondents |
|---|---|
| 5 | 0 |
| 4 · Trust | 4 |
| 3 · Neutral | 2 |
| 1–2 · Distrust | 0 |

Mean 3.67/5. Four of six respondents selected Trust, while the remaining two were Neutral; none
selected a distrust response.

**Q7 · Biggest concern (single choice)**

| Answer | Respondents |
|---|---|
| Fund safety | 3 |
| Collusion or fake attestations | 2 |
| No major concern | 1 |
| Ease of use | 0 |
| Privacy | 0 |
| Wallet or blockchain issues | 0 |

Wallet complexity and privacy were not selected as any respondent's single biggest concern. That
does not mean they are not concerns at all.

Exploratory observation, from two respondents only: both respondents who reported experience
organizing events selected collusion or fake attestations as their top concern. This is not a
general conclusion about organizers.

**Q8 · Willingness to try PeerProof at a real small event**

| Answer | Respondents |
|---|---|
| Definitely | 1 |
| Probably | 4 |
| Not sure | 1 |
| Any negative answer | 0 |

Five of six were Probably or Definitely willing to try PeerProof at a real small event.

Exploratory observation: the only uncertain respondent had no prior event experience, had never
used a crypto wallet and gave the lowest comprehension score. This is one individual's pattern in
the sample, not a causal conclusion.

**Q9 · Self-reported demo completion time**

| Answer | Respondents |
|---|---|
| 1–2 minutes | 2 |
| 2–3 minutes | 4 |
| More than 3 minutes | 0 |

All six respondents reported completing the demo within three minutes. These are respondents' own
estimates, not instrumented analytics or independently measured timing.

**Wallet background (Q11) against comprehension, trust and intent**

| | Use a wallet regularly (n = 2) | Never used a wallet (n = 4) |
|---|---|---|
| Mean comprehension (Q3) | 3.5/5 | 3.0/5 |
| Mean trust (Q6) | 4.0/5 | 3.5/5 |
| Willing to try (Q8) | Both Probably or Definitely | 3 Probably, 1 Not sure |

This is a directional observation only: two respondents against four is too small for a
quantitative comparison. The more useful point is that three respondents who had never used a
crypto wallet were still willing to try PeerProof, suggesting that prior wallet experience was not
an absolute barrier within this sample. It does not show that wallet onboarding is solved.

### Key findings

1. The no-show problem was familiar within this small sample: all five respondents with event
   experience had encountered no-shows at least rarely.
2. The core flow was broadly understandable (five of six Mostly or Clearly, mean 3.17/5), but no
   respondent selected Very clearly.
3. The public verification graph (4 of 6) and the path from verification to settlement and refund
   (3 of 6) are the clearest UX gaps.
4. No respondent rejected a refundable deposit outright: four of six selected $5 or more, and one
   said it would depend on the event.
5. Peer attestation drew Trust (4 of 6) or Neutral (2 of 6) responses and no distrust (mean
   3.67/5).
6. Fund safety (3 of 6) and collusion or fake attestations (2 of 6) were the leading single
   concerns.
7. Five of six would probably or definitely try PeerProof at a real small event, including three
   respondents who had never used a crypto wallet.
8. All six reported finishing the demo within three minutes (self-reported).

### Product implications

Priorities and lessons from the survey. Where one has since been acted on, the note says where;
none of these changes has been retested with respondents.

1. Make the public verification graph easier to interpret.
   **Implemented after the pilot and survey** (`/verify`, `/demo`): the live graph now draws an
   arrowhead on every vouch, pointing at the person scanned — before, direction showed only in
   moving dots, which reduced-motion settings remove and a still screenshot cannot show — and both
   graphs carry a visible legend.
2. Explain how peer attestations lead to confirmed attendance.
   **Implemented after the pilot and survey** (`/floor`, `/event`, `/verify`, `/demo`): the status
   rows, the rules list and the graph legends all say that a scan counts for both people but only
   the scanner initiates an attestation, and that everyone must initiate at least one.
3. Explain contract custody, settlement conditions and refund timing more clearly.
   **Implemented after the pilot and survey** (`/event`, `/floor`): custody, settlement by anyone
   once the window closes and both full-refund branches are listed before registration, and the
   deposit-outcome row on `/floor` follows the event's state. No settlement date is promised,
   because settlement happens only when somebody triggers it.
4. Explain anti-collusion safeguards honestly, without claiming collusion is eliminated.
   **Partly implemented after the pilot and survey** (`/event`): the rules tab no longer says remote
   collusion cannot happen; it now says relaying the live venue code from inside the room makes it
   costly, not impossible. There is still no dedicated explanation of collusion limits.
5. Preserve a demo path that remains understandable to people without prior wallet experience.
   Unchanged and still in place: `/demo` needs no wallet and sends no transaction.
6. Keep the core experience within approximately three minutes.
   Not acted on and not measured: the additions are explanatory text, and nobody has timed the
   updated flow.

Suggested explanatory copy, recorded as a future UX recommendation at the time of the survey:

| Suggested copy | On the site at the time of the survey |
|---|---|
| "Each line represents one participant confirming that another participant was physically present." | Partly. The walkthrough's graph legend labels an arrow "One scan, counts for both", and the public record (`/verify`) lists every line as "0x… vouched for 0x…" with its transaction; neither says that a line means one participant confirming another was physically present. |
| "Your deposit is held by the contract, not by the organizer." | Already there in substance: the event page shows "Held by the contract. Not by the organizer." under the deposit and, after registration, "You're in. Your deposit is held by the contract, not by the organizer." |
| "Your refund eligibility depends on completing the attendance requirements shown here." | Not on the site. |

After the survey, the first and third suggestions were implemented in adapted form. The graph
legend on `/verify` reads "Each arrow is one accepted on-chain attestation: the person at the tail
scanned the person at the arrowhead. The scan credits both people toward the required count, but
each person must initiate at least one scan to qualify." (the `/demo` version opens with
"Illustrative data."). `/floor` shows a deposit-outcome row under the requirement rows, with the rule
"To count as present, check in at the venue, initiate at least one attestation, and receive the
required peer confirmations." The second suggestion was already on the site and is now also the
first item of the `/event` rules list. Neither legend claims that an arrow proves physical presence.

### Limitations

- Convenience sample of six respondents.
- Directional early evidence only; not statistically representative.
- Responses were self-reported.
- The survey used closed-choice questions and did not collect detailed reasons.
- Completion time was self-reported, not instrumented.
- It does not establish production adoption, retention, revenue, product-market fit or market
  traction.
- The survey does not by itself prove that respondents were independent from one another.
- Whether any respondent also took part in Event #2 or the interviews has not been confirmed, so no
  total unique-participant count is given across the survey, the interviews and Event #2.
- Respondents are not identified, and their row-level response combinations are not published.
- The interface was changed after the survey (see [Post-research product changes](#post-research-product-changes)); the
  updated interface has not yet been revalidated with respondents or anyone else.

## Post-research product changes

After the pilot, the interviews and the survey, the interface was changed in response to them.
These are product changes, not new validation: nobody from the pilot, the interviews or the survey
has used the updated interface, so whether the changes resolve the reported problems is untested.

### From evidence to product changes

The demo video was recorded on 2026-09-21, before any of the changes below, so a few screens in it
differ from the live build. Each row pairs a problem recorded above with the change it motivated and
the commit that made it.

| Observed problem | Evidence source | Product change | Relevant commit |
|---|---|---|---|
| Being scanned by others did not mean an attendee had done their part: confirmation also needs an attestation they initiate themselves, and that rule was counterintuitive. | Event #2: the second participant checked in and was scanned but initiated no attestation, and was not confirmed. Participant B; interview findings 2 and 4. | `/floor` replaces the single vouch count with four status rows — venue check-in, attestation initiated, peer confirmations received against `k`, deposit outcome — and states the attendance rule beneath them. Copy that implied one scan completes both people was reworded, including the "already vouched" error and the sign-in steps. | `bd8e92f` |
| The venue check-in code and the participant attestation code were easy to confuse. | Participant B; interview finding 3. | The scanner, the attendee's own code on `/floor` and the venue display name the code and its rotation — "Venue check-in code", every 30 seconds; "Participant attestation code", every 15 seconds — each with its own glyph and colour. After check-in the scanner shows the peer-code hint. | `bd8e92f` |
| How the deposit is returned, and what final eligibility requires, was not intuitive. | Participant A; interview finding 1; survey Q4 (3 of 6 chose deposit refund and settlement as hardest to understand). | `/event` lists, before registration, the three attendance conditions, settlement by anyone once the window closes, the payout, and both full-refund branches. `/floor`'s deposit-outcome row follows the event's actual state. | `bd8e92f` |
| The public proof graph was the hardest part to understand. | Survey Q4 (4 of 6 chose the public verification graph as hardest to understand). | `/verify` draws an arrowhead on every attestation, pointing at the person scanned, with a visible legend; `/demo` carries the same legend, marked as illustrative data. The live record's header now names its network: "Monad testnet · on-chain record". | `bd8e92f` (arrows, legends); `56cd79e` (network label) |
| Who holds the deposit, when it is returned, and how collusion is limited were open questions. | Participant A (custody, refund timing, collusion explained honestly); Participant B (collusion remains possible; very small events need the fallback); interview findings 5 and 6; survey Q7 (fund safety 3 of 6, collusion or fake attestations 2 of 6). | `/event` states that the contract holds the deposit and the organizer cannot take it in any branch, explains the small-room organizer fallback and its limits, and no longer says remote collusion cannot happen: it says a live relay makes it costly, not impossible. | `bd8e92f` |
| Funding a wallet with testnet MON was an onboarding obstacle. | Participant B; interview finding 7. | When a wallet is short, the funding card on `/event` separates the deposit from room for gas and says gas is paid from the attendee's own wallet and is not sponsored; the README says the same. This clarifies the obstacle; it does not remove it. | `56cd79e` |

These changes address issues found during the pilot and research, but the revised interface has not yet been re-tested with participants.

The full list of interface changes made after the research follows.

- **Explicit eligibility checklist on `/floor`:** venue check-in, attestation initiated, peer
  confirmations received (against `k`) and deposit outcome as separate rows, with the attendance
  rule beneath them. The deposit row follows the contract's state — open, settled or cancelled;
  confirmed or not; claimed or not — and does not promise a payout the contract would refuse.
- **Distinct venue and participant QR labels:** "Venue check-in code" (venue display, every 30
  seconds) and "Participant attestation code" (another participant's phone, every 15 seconds), in
  the scanner, above the attendee's own code on `/floor`, and on the venue display.
- **Pre-registration explanation of custody, eligibility and refund branches on `/event`:** the
  three attendance conditions, how one scan counts for both people, settlement by anyone after the
  window, the payout, both full-refund branches, and the small-room organizer fallback and its
  limits.
- **Clearer graph semantics on `/verify` and `/demo`:** arrowheads on the live graph pointing at the
  person scanned, and a visible legend on both, the demo's marked as illustrative data.
- **Copy that implied one scan completes both people** was reworded where it appeared: the `/floor`
  sign-in steps, the "already vouched" error, the how-it-works dialog, the event page's
  peer-vouching tile, the demo's third step, and the label on the event listing card.
- **Two overstatements were removed:** the `/floor` settlement card no longer says a scheduled job
  settles events in production (it says anyone can trigger settlement once the window closes), and
  the `/event` rules tab no longer says remote collusion cannot happen.
- **Judge path from the demo to the real record:** `/demo`'s last step leads first to the verified
  Event #2 record and second to the illustrative proof; the illustrative proof links back to
  Event #2, and the live record names its network ("Monad testnet · on-chain record").
- **Deposit and gas named separately:** when a wallet is short, the funding card on `/event` splits
  what registering needs into the deposit and room for gas, and says gas is paid from the
  attendee's own wallet and is not sponsored. This makes the testnet-funding obstacle (Participant
  B; interview finding 7) clearer; it does not remove it.

No contract, transaction, address, amount or on-chain record changed.
