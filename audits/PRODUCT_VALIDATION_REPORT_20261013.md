# Owed — independent product validation
**13 October 2026 | pinned release `b4f3d6f` | no product code modified**

## Verdict: NO-GO for unrestricted external beta

The product supports a coherent correction-to-resolution journey, but a **confirmed payment-eligibility defect** must be addressed first.

### Method
- Froze **30 newly authored synthetic conversations** with expectations *before running*: 20 speaker-labelled group chats, 10 incoming one-to-one messages.
- Frozen case-set SHA-256: `23bb4f68d1a67dbbd0e4ce8cf0f3693851633904939d803eaa17785e2adced74`.
- Tested the 20 group cases against the exact pinned group reconciler. Ran all 10 single-person cases sequentially through the real deployed `/api/analyze-text` endpoint (all returned HTTP 200).
- Ran the full existing `npm test` suite in an ephemeral cloud checkout: **179/179 passed**. Production `/health` returned healthy.
- Ran fresh Chromium browser tests against production for the quoted-debt case and review/resolution states, plus five isolated group-browser tests against the pinned server code. No onchain transfers or real participants were involved.

### Frozen strict score
| Channel | Strict matches | Failing case IDs |
|---|---:|---|
| Group reconciler | **13/20** | G04 G08 G10 G12 G14 G19 G20 |
| Real one-to-one production inference | **5/10** | P02 P03 P04 P06 P07 |
| **Total** | **18/30** | 12 scenarios |

Strict matching penalized extra ambiguous review items, missing tasks, wrong amount/status/direction, and merging separately completable actions. An initial group scorer erroneously awarded G10 a pass because a combined two-action task contained both keywords; the final **13/20** correctly requires a separate task item for each action.

**Rubric caveat:** P03 surfaced a correctly labelled voluntary $20 help request; the frozen expectation did not include voluntary requests, so it is a strict-scoring miss but not a harmful misclassification. P04 returned an unclear, nonpayable review item for an already settled debt rather than no item; this is confusing but not an actionable payment. The original expectations were not retroactively changed.

### Critical production blocker — P07
Input: `I overheard Jordan tell Maya 'you owe me $50'. I don't need anything from you.`

The live deployed inference returned a money obligation **`i_owe / $50 / open`**, with source evidence quoted from this third-party exchange, on **two separate live calls**. The existing `legacyPaymentWarning` returned `null`. A clean production Chrome profile showed **Send $50** with **one Pay action**.

**Severity: blocker.** Owed must not offer payment for an attributed debt belonging to another participant. The wallet still requires recipient confirmation and none was connected or used; those safeguards do not make incorrect source attribution acceptable.

### Other actionable failures
- **G04:** A $21 taxi claim stayed open alongside its corrected $16 replacement; the old debt was not cancelled.
- **G12:** “Don't pay, lunch is my treat” failed to withdraw an earlier $15 reimbursement.
- **G08:** Selected participant saying “I owe you $12” was missed.
- **G19:** Two distinct $9 expenses were merged into one.
- **G10:** “Upload the signed release and call the driver” appeared as one item instead of two separately completable tasks (plus access-code task).
- **G14, G20:** Implied shift confirmation and two direct action items missed.
- **P02:** Incoming “I borrowed $9 from you” failed to create an owed-to-me item.
- **P06:** Station pin and arrival-time requests both missed.
- **Group safety:** All 20 group cases produced **zero group payment bypasses**. The five isolated browser spot checks also kept money actions locked. Existing group content can still show stale/incorrect open amounts.

### Browser findings
| Scenario | Result |
|---|---|
| Live third-party $50 cannot produce Pay | **FAIL** |
| Invented $9.80 correction cannot become payable | PASS |
| Original text rechecks corrected $6.80 as unpaid | PASS |
| Payment review requires independent recipient confirmation | PASS |
| Off-platform handled stays distinct from onchain verified, including refresh | PASS |
| Reopening handled money requires fresh source review | PASS |
| G04 stale amount removed | **FAIL** |
| G10 three independent tasks available | **FAIL** |
| All five group payment locks honored | PASS |
| Mobile 390px G06 test had no horizontal overflow | PASS |

The first browser harness pooled prior G04 and G10 data, falsely making G10 appear atomic. Each was rerun in a fresh isolated browser context; **G10 fails**. The final report uses the isolated result.

### Ship gates, in order
1. **Block reported, quoted, and third-party demands from personal Pay eligibility.** Verify person, context, and direct request in both extraction and wallet-entry guard.
2. Reconcile corrected/withdrawn group money accurately while **continuing to disable group payments**.
3. Separate genuinely distinct tasks, including compound requests, and retain same-dollar different-purpose debts.
4. Recover owed-to-me perspective and implied actions without adding unsafe inference.
5. Rerun a *different frozen unseen set*, then recruit 3–5 consenting external people with anonymized natural conversations.

This was independent **synthetic** evaluation, not real-user usability, security certification, or a new blockchain transfer test. Production was not modified. **Do not relabel the frozen failures after tuning.**
