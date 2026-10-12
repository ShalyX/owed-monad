# Owed — Conversation Event Reconciler / Group Payment Hold
13 October 2026

## Release decision
**Group-derived payments remain disabled.** This includes newly extracted and older browser-saved group money cards, regardless of how clearly an amount appears to be owed. The UI removes Pay, the wallet quick action excludes group items, and both the payment-review entry point and final wallet authorization handler reject group-derived money. One-to-one USDC transfers and independent receipt recovery are unchanged.

## Architecture
- Speaker-labelled messages become ordered speech acts: source speaker, explicitly addressed participant, clause, offset, type and source quote.
- The reconciler matches monetary requests against later corrections, waivers and acknowledgements by payer/payee, amount when available and chronological order.
- It retains the event history and distinguishes `conversation_confirmed` from `settled`. **Only a verified onchain receipt produces `settled`.**
- An explicit money correction supersedes the earlier amount; a second statement of the new amount in the same speaker turn doesn't create a second debt.
- Nonmoney tasks are individual action records with independent IDs, status and task key.
- Existing group records are review-only even without the newer event metadata. Re-analysis can update open group money cards on a matching source quote without overwriting an onchain receipt or a user decision.

## Original frozen 40-case regression
- Original pre-upgrade release: 25/40 strict, 5 incorrect outgoing money cards.
- Event reconciler replay: **36/40 strict**, **0 incorrect *open* outgoing money cards** in these cases.
- G20 and G26 were mislabelled benchmark fixtures: the selected listener never appears as a speaker; HTTP 422 is a correct safeguard.
- G19 and G40 now preserve a conversation-confirmed money item as `conversation_confirmed`, rather than removing it entirely as the original label expected. This is **not verified onchain** and is excluded from the open payable state.
- These are *replays of a known set*, not fresh blind accuracy estimates.

## Independent holdout — 20 frozen examples
- Frozen 20 fresh synthetic cases, digest `865c0f1329b5c3621f5e85e9af041a31ce916118af299b6b256691758d1d3b40`.
- The first holdout run exposed a **duplicate corrected amount** in H06: $30 was marked cancelled, but the corrected $25 appeared twice, once as a correction and again as a same-turn request.
- The initial quick scorer did not enforce money-card multiplicity, so its apparent **20/20** was overstated. With multiplicity correctly considered, the initial result is **19/20**.
- After fixing same-turn duplicate event consolidation, a **regression replay passes 20/20**. That second score is *not* an independent fresh holdout.
- This is synthetic, source-grounded evaluation; it is not evidence of reliable generalized understanding of natural-language group chats.

## Safety and testing
- 162 repository unit/API tests, including six new event and payment-lock regressions, passed locally.
- Existing single-party wallet and receipt-recovery browser smoke passed without initiating new transfers.
- Production browser verification checks: selected participant, named money, **no group Pay action**, two independent actions, and state restored after refresh.
- No second onchain payment was needed for these tests.

## Limitations and release gate
- No group wallet payment activation until independent evaluation on a larger unseen sample and fresh-browser risk tests confirms no false payable transfers.
- This deterministic model is intentionally conservative and does not infer implicit addressees or wallet identity, resolve unlabelled speaker aliases, or assert that a chat acknowledgement proves payment.
- More elaborate corrections, mixed subjects, and implied actions may still be missed. The Review-only state exists for that reason.

## Evidence
- `audits/group-unseen40-frozen-20261011.json`, `audits/group-unseen40-baseline-20261011.json`, and `audits/group-unseen40-development-replay-20261013.json`
- `audits/group-event-holdout20-frozen-20261013.json`, `audits/group-event-holdout20-result-20261013.json`
- `scripts/group-development-replay.mjs` and `scripts/group-event-holdout20.mjs`

## Production verification after deployment
- Production commit: `cced59a`; Owed health endpoint returned healthy on the private VPS.
- A fresh HTTPS Chrome run confirmed the Alex $12 and Shaly $25 cases were displayed as group obligations **without Pay in USDC**, alongside individually completable non-money tasks. The selected wrong-party Tunde remained uncharged.
- A separately injected **older browser-saved group debt** remained nonpayable after refresh, proving that the lock does not rely on new group-result metadata.
- Single-person HTTPS browser test confirmed a $0.01 USDC review still opens, requires recipient validation, and does not initiate a transfer without authorization; task completion persisted after a real refresh.
- Parallel browser runs initially hit the intentional single-inference public concurrency limit. Re-running sequentially passed both. The browser smoke was adjusted to wait for reload completion instead of asserting after an arbitrary 600ms delay.
- Existing wallet and receipt-recovery browser smoke and all 162 local automated tests passed. **No new wallet transfer was sent.**
