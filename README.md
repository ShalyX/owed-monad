# Owed

**From conversations to completion.** Owed turns the little promises buried in one-to-one conversations into separate, reviewable money requests and follow-ups. Eligible payments can be settled with wallet-approved USDC on **Monad Testnet**.

[**Try Owed**](https://owed-monad.tail5a7dd1.ts.net/) · [**Watch the working-product demo**](https://owed-monad-submission-videos.vercel.app/technical.mp4) · [**Pitch video**](https://owed-monad-submission-videos.vercel.app/pitch.mp4) · [**Videos and motion experiments**](https://owed-monad-submission-videos.vercel.app/)

> This is a hackathon prototype running on Monad Testnet, not a production payment service. The public app is served through Tailscale Funnel on an owner-operated VPS; availability is not guaranteed.

## What it does

- **Capture:** Paste a direct message, record a spoken reminder, or import a voice note / supported text note.
- **Understand:** Whisper transcription and a private Qwen2.5 inference worker (or an optional Hugging Face provider) help identify obligations. Deterministic checks validate monetary evidence and context.
- **Separate:** Show each independent money request and follow-up in its own card, citing the source words.
- **Complete:** Finish or reopen to-dos without changing the state of a separate money request.
- **Review and pay:** Where eligible, review the amount and independently verified recipient, authorize the transfer with a browser wallet, and confirm settlement only after matching the on-chain USDC transfer and successful receipt.

**Scope:** One-to-one conversations only in this release. Group conversations are not supported for new payable actions; older saved group items remain review-only. A request for optional help is not automatically a debt.

## Quick start

Requires **Node.js 22+**. The app server uses built-in Node modules, so no dependency installation is required for the basic flow.

```bash
npm run check
cp .env.example .env
# Configure HF_TOKEN in .env for the optional hosted inference lane.
node --env-file=.env server.mjs
```

Open **http://localhost:3000**. On Windows, copy the environment file using `Copy-Item .env.example .env` instead of `cp` if needed. Never commit `.env` or share model tokens. The deployed VPS uses a separately authenticated private inference worker rather than a visitor-provided Hugging Face key.

To verify the Monad RPC and testnet USDC contract: `npm run probe:monad`. Network and funded-wallet tests are separate from unit tests.

## Network and verified evidence

- **Network:** Monad Testnet, chain ID `10143`.
- **Token:** Circle's testnet USDC at `0x534b2f3A21130d7a60830c2Df862319e593943A3` (6 decimals).
- **Historical on-chain evidence:** A wallet-approved **0.01 USDC** transfer was independently checked against the transaction, token transfer data and receipt: [view the testnet transaction](https://testnet.monadvision.com/tx/0x1b2bf93586941a3e9126081e3ac97c950e52ece2b1a71cd4705ed96e370e371f).

The technical walkthrough demonstrates live analysis, separate actions, payment review and persistence. **It does not execute a new transfer.** Illustrative motion videos are marketing material, not transaction proof.

## Architecture and limits

`Browser UI (public/)` → `Node HTTP API (server.mjs)` → `authenticated private inference worker` → `local speech/text models`.

The browser holds source conversations and state in `localStorage`, which is neither encrypted nor synced across devices. Model outputs can be inaccurate; source evidence must be checked by the user. Owed does not accept model-inferred recipient addresses, does not automatically sign transactions and cannot establish legal liability or recipient identity. Text/audio inference runs on the VPS in the public deployment.

## Repository guide

| Path | Purpose |
| --- | --- |
| `public/` | Browser app, styles, user interactions, payment and recovery UI |
| `lib/` | Server-side analysis, receipt verification and safeguards |
| `server.mjs` | HTTP server and analysis endpoints |
| `tests/` | Regression and safety tests (`npm run check`) |
| `scripts/` | Developer diagnostics, receipt verification and browser regression checks |

### Verification

Run `npm run check` to execute the maintained safety and regression tests. `npm run probe:monad` inspects testnet infrastructure; `npm run verify:payment -- 0xTXHASH 0xPAYER 0xRECIPIENT 0.01` independently verifies a specific USDC transaction. These checks do **not** initiate a wallet transfer.

For a walkthrough, see the hosted [working-product technical video](https://owed-monad-submission-videos.vercel.app/technical.mp4). It demonstrates real analysis, review and task completion without claiming a fresh transfer.

Owed builds on the voice-transcription exploration behind [VoiceDebt](https://github.com/ShalyX/voicedebt) but is a distinct product with its own Monad payment flow and design.
