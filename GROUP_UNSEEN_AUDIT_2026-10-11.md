# Owed — Unseen multi-person conversation evaluation
Date: 2026-10-11
Candidate release: d00a5bd (unchanged by this audit)

## Experimental protocol
- Forty new, synthetic speaker-labelled group conversations were authored and frozen **before the first evaluation request**.
- Frozen test-set SHA-256 (cases JSON, in original order): `7285cb857570161de403fc4f7d088d0388cdb2f7f0b081746a5c4b6da21d91ca`.
- The evaluation executed the exact deployed source on the production VPS through an isolated HTTP instance, so it used the real group resolver and API but did not invoke the tiny inference model (group conversations take a deliberately conservative deterministic route). No wallet transactions were initiated.
- Scoring required the correct selected user, direction, amount, number of money items and distinct task objects. Extra money items are failures. A correct non-payable decision counts as success for ambiguous and implicit requests.

## Frozen, unmodified benchmark result
- **25/40 strict pass (62.5%)**, **15/40 strict fail**.
- **5 false outgoing money items** identified: **G13** (similar names + late address), **G16** (quoted payment instruction), **G17** (gift waiver / 'don't pay'), **G19** (payment subsequently acknowledged), **G40** (payment subsequently acknowledged, with a fresh non-money task).
- For all five, `legacyPaymentWarning()` returned no blocking warning in an independent local check of the stored source text. The frontend ordinarily exposes Pay on such open i_owe items. This is a critical release issue; do not conclude that identity selection alone makes payable group items safe.
- G20 and G26 were **test-design mistakes**: the requested participant, Nia, was not a speaker-labelled participant in those fixtures. HTTP 422 is the **correct** identity safeguard. Their pre-registered expected HTTP 200 values were wrong. We have **not altered the original fixtures or results**. If those two cases are independently adjudicated as expected HTTP 422, the score is **27/40 correct (67.5%)**, leaving 13 product/coverage failures.
- No distinct chain transactions were performed or claimed.

## Remaining failures grouped by underlying issue
**Wrong-person / speech-act interpretation, safety critical:**
- G13: request to Samantha followed by a separate request to Sam in the same speaker turn; selected Sam was incorrectly assigned Samantha's $16 debt. The implementation's `addressed()` finds the selected name later in the string, then slices the body using the matched *length* rather than *index plus length*, pulling in the earlier payment command. This is a structural span bug, not proof the two names were treated as identical.
- G16: quoted joking payment language extracted as a live debt.
- G17: explicit negative instruction `don't pay me` and gift status ignored.
- G19 and G40: later sender receipt/settlement confirmations were not reconciled against earlier requests. The first request remains payable.

**Task identity and action extraction, missing but not an unsafe outgoing transfer in these cases:**
- G21: two object deliverables missed.
- G22: first of two separate tasks missed.
- G23: only one of two objects was recognized.
- G25: separate sign-in sheet missed after a correct $2 debt.
- G31: second object lost on an unlabeled continuation line.
- G37: neither of two objects without a repeated article extracted.
- G38: `can you call him` overlooked.
- G40: forward corrected poster omitted as well as obsolete debt.
- G13: `take photos` was missed and a $16 wrong-party payment was added.

**Omitted money:**
- G27: a direct remaining-$8 request was missed because current group money handler didn't interpret that surface form.

## Correct handling demonstrated
The released resolver correctly abstained when an expense was only a group total, a payment was implied rather than addressed, a person was merely mentioned, a nickname wasn't established, the user was an observer, or a request targeted a different labelled participant. Explicit named incoming money owed to the selected person was correctly classified as `owed_to_me`, not payable.

## Recommended engineering response
1. **Stop-the-line safety gate**: disable the *Pay in USDC* action for group-derived financial items until a conversation-level reconciler verifies speaker identity, explicit instruction, negations and later reversals. Do not rely on short evidence spans or optional recipient confirmation as a substitute for this.
2. Build a true **speaker- and turn-indexed evidence graph**: store offsets, source speaker, addressed speaker, referenced payer/payee, and money/task acts. Never reuse the source of one participant as another's obligation.
3. Process timeline events **request → correction → cancellation/receipt**, preserving audit history and displaying the latest state rather than the first amount seen.
4. Represent obligations and tasks as separate **action nodes**, each with a concrete object, actor, requestor, and independent completion state. Let a review screen resolve uncertain addressees without inventing a payable request.
5. After corrections, replay this frozen set as a **regression only**, and build a *new* withheld set for an unbiased accuracy measurement.

## Supporting evidence
- `audits/group-unseen40-frozen-20261011.json`: immutable first-run input/expected-label dataset.
- `audits/group-unseen40-baseline-20261011.json`: raw output for every case, including money, task, HTTP status, counts and adjudication detail.
- `scripts/group-unseen40-audit.mjs`: reproducible HTTP scorer using the production code's `makeServer({publicDemo:false})` path.

**Interpretation:** We tested, identified real release-blocking group-payment safety flaws, and deliberately did **not** tune the released resolver against this benchmark before recording the result. This audit does not attest that group-chat payments are safe to perform.
