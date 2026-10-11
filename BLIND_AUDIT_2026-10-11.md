# Owed: Blind Conversation Evaluation — 11 October 2026

## Protocol
- 30 newly authored, synthetic conversations were frozen before their first inference result.
- Frozen evaluation-set SHA-256: `a2ae26b1da0cd77ae48d8859d927661efceb875a17d34641e741fa810fa30b95`.
- Runner exercised Owed's deployed code and real private Qwen2.5 0.5B inference worker; requests were made sequentially through an isolated local HTTP instance on the production VPS to avoid the public-demo rate limit.
- No mock model responses and no actual wallet transfers were used.
- Strict scoring requires correct direction, exact amount, correct intent, no unrelated money or task cards, and separate tasks when separately expected.

## Frozen first-run baseline
- 30/30 HTTP requests returned 200.
- **14/30 complete strict passes (46.7%).**
- **16/30 failed at least one strict criterion.**
- **3 incorrect payable money entries**: B04 (forgiven $13 dinner), B10 (superseded $28 grocery amount), and B26 (waived $5 photocopies). These are safety blockers, not merely missing task labels.

| Test | Baseline | Key observation |
|---|---|---|
| B01 | Fail | Correct $14.75, plus shadow “Send payment” task |
| B02 | Fail | Missed $9.20 owed to the user |
| B03 | Pass | $45/3 split correctly $15 |
| B04 | Fail | Forgiven $13 incorrectly payable |
| B05 | Pass | Work-contingent $11 not payable |
| B06 | Fail | Optional $2.50 truncated to $2 |
| B07 | Fail | Identical Google Maps task returned twice |
| B08 | Pass | Already-paid $45 not owed; tracking task retained |
| B09 | Pass | Separate $4 parking and $3 toll |
| B10 | Fail | Superseded $28 presented; corrected $23 missing |
| B11 | Pass | Hypothetical loan not owed |
| B12 | Pass | Imagined $50 debt not owed |
| B13 | Fail | Check-payment-arrival task missed |
| B14 | Fail | Group chat lacks identified user; no reliable $12 attribution |
| B15 | Fail | Processed $18.75 refund retained as unclear money |
| B16 | Fail | Gift mentioned as unclear money; false “send it back” task |
| B17 | Pass | Wallet address mention alone not payment |
| B18 | Pass | Price quotation not a debt |
| B19 | Pass | 0.000001 USDC exact |
| B20 | Fail | “split last week” wrongly suppressed 0.075 USDC debt |
| B21 | Pass | “Pay next Friday” preserved existing $17 debt |
| B22 | Fail | $10 minus acknowledged $3, outstanding $7 missed |
| B23 | Fail | Self-recorded $6 debt owed to named person missed |
| B24 | Pass | Confirmed sender transfer not a new debt |
| B25 | Pass | Unconfirmed $22 ticket not payable |
| B26 | Fail | Waived $5 debt incorrectly payable; PDF task missed |
| B27 | Pass | Text-only assertion of 0.03 USDC transfer not treated as user debt |
| B28 | Pass | Ferry/bus prices not debts; timetable task identified |
| B29 | Fail | Guest-list task missed |
| B30 | Fail | $2.25 identified but two requested actions were merged into one task |

## Correction strategy
Safety-first deterministic checks were added for explicit cancellations, exact revised amounts, decimal voluntary requests, already received partial payments, self-recorded named-person debts, and ambiguous “split” references. Repeated tasks are deduplicated, and the single-instance model is protected against concurrent public inference. These checks are limited to source-grounded text and must not be interpreted as broad language understanding.

## Interpretation and limitations
- These thirty tests are a small, synthetic blind sample; results must not be generalized to all accents, chats, or users.
- The B14 group chat does not actually tell Owed that the user is Alex. The original $12 “i_owe” expectation is therefore underspecified; no personal transfer should be enabled without identified speaker context.
- B30 has both requested actions in one combined task card. The content is captured, but individual completion tracking is missing.
- The externally accessible browser was tested separately; no wallet-signed transaction was performed during this evaluation.
- Replays of these same 30 examples **after a correction** are regression tests, not an independent second blind evaluation.

## Release evidence
- Local regression suite after initial fixes: 142/142 passing.
- Public fresh-browser baseline: HTTPS secure, empty profile, real conversational analysis, task and money cards, payment review requires independently verified recipient, and no transfer without authorization.
- See the companion `tests/blind-safety-regressions.test.mjs` for exact reproductions of discovered defects.

## Production replay after safety patch

After deploying commit `32ae24f`, the **same 16 initially failing cases** were re-run sequentially against the updated VPS inference stack (not against mocks). **14/16 strict passes, 2/16 remaining failures, 0 incorrect payable results**.

- Repaired from baseline: B01, B02, B04, B06, B07, B10, B13, B15, B16, B20, B22, B23, B26, B29.
- Remaining B14: unresolved group-chat user identity. Do not infer the user's identity from a named speaker or turn. The model returned an unclear $36 expense and an inappropriate task; no Pay USDC transfer was offered. A future design must explicitly resolve perspective before recording group debt.
- Remaining B30: printing $2.25 is correct, but flyer and location-link requests still share one task. For independent completion they should be separate.

The original 14 passes were not re-run in this targeted replay. **Do not report 28/30 as a new observed full-suite score**. The observed blind score remains 14/30 and the observed targeted replay is 14/16.

## Production browser and regression checks
- 142/142 local automated tests pass (including 13 new blind-failure regressions and single-model concurrency protection).
- Production server health confirmed on `32ae24f`.
- A new, disposable public HTTPS browser profile had no saved conversations and no wallet. Real message inference generated a money item and task; Pay review began with no recipient or prechecked verification; sending without a recipient was blocked.
- Task completion survived an actual browser reload while the unpaid money card remained available and no wallet was present. **No wallet signing or new transfers were attempted.**
- The public inference gate now admits one active analysis at a time rather than two because the small private worker returned HTTP 503 under overlapping inference load.

## Reproducibility files
- `audits/blind30-cases-20261011.json`: the frozen input messages and intended labels, with matching SHA-256.
- `audits/blind30-baseline-20261011.json`: the original unmodified 30-case output.
- `audits/blind30-replay-20261011.json`: responses from the updated release for the previously failing 16 cases.

**Release interpretation:** The identified unsafe payable cases are fixed in the targeted regression set, but the assistant remains a small model augmented by narrow source-grounded rules. Group-chat speaker attribution, independent completion of combined tasks, and broader real-world accuracy remain open. External users should verify evidence and recipients before authorizing any testnet transfer.
