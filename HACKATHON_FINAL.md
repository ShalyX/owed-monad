# Owed — Hackathon final scope

**Product:** Turn a one-to-one message or voice note into clear to-dos and money requests, then help resolve them with source evidence. Optional USDC settlement runs on **Monad Testnet**, never automatically.

## Three-minute walkthrough

1. Paste **one person's message**, record a reminder, or import an audio note. Click **Find the loose ends**.
2. Inspect each extracted item and its original quote. Complete an independent task or use **Correct** to review a mistaken amount, direction or status.
3. Manually corrected money is **review-only** until a separate source-text check confirms the exact quoted request. A source match is **not** proof of wallet ownership, legal debt or payment.
4. For a directly attributed unpaid request, **Pay in USDC** opens recipient review. The user must supply and independently verify an address and separately approve the browser-wallet transaction.
5. A matching onchain receipt is required before displaying **Verified onchain**. “Handled outside Owed” and “acknowledged in chat” are never blockchain receipts.

No funded wallet is required to demonstrate extraction, corrections, independent tasks and the payment review gate.

## Hard scope boundary

- **One-to-one only.** New group conversations are rejected in the UI and text API. Imported multi-person text exports are rejected. Older saved group items remain review-only and cannot pay.
- No mainnet, fiat, bank integration, automatic transfers, or assurance that a model-generated debt is genuine.
- Prior validation exposed a quoted $50 debt belonging to Jordan and Maya incorrectly displaying Pay. This release checks full-source third-party reporting before extraction is accepted, again when rendering Pay, at payment review, and during source recheck. A saved old card is also blocked.
- This is a testnet hackathon prototype. Users must verify recipient identity and the underlying obligation independently.

## Verification

- Node.js 22+: `npm run check`.
- `tests/hackathon-core.test.mjs` covers wrong-person debt, source recheck, legitimate direct messages and one-to-one-only scope.
- An isolated fresh-Chromium 8-case browser smoke exercised group UI and API rejection, bad-model response blocked from Pay, an old saved bad card after refresh, direct payment review without a wallet, source recheck rejection and mobile width.
- Earlier 30-case validation had 18/30 strict synthetic passes, but 20 of those cases tested group features now removed from scope. **Do not present 18/30 as a benchmark for this focused release.** The new tests are targeted regressions, not a fresh independent accuracy estimate.
- No transaction was signed or sent during this final pass; the existing wallet and recovery flows have separate tests and previous chain receipts.

**Public demo:** https://owed-monad.tail5a7dd1.ts.net/ (VPS-hosted). **Technical product demo:** https://owed-monad-submission-videos.vercel.app/technical.mp4 (1m 16s). **Earlier narrated walkthrough:** https://owed-monad.tail5a7dd1.ts.net/owed-metropolis-demo.mp4 (1m 45s). The final one-to-one release was deployed and verified on the VPS at revision `4a532e6`; subsequent documentation and video hosting commits add public submission material. The VPS should be checked before presenting it live.
