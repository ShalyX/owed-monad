# Owed — From conversation to completion

A usable Monad Testnet MVP: paste messages, record voice, or import a voice note. Whisper transcribes speech, Gemma extracts explicit obligations, and the user decides what to complete. For money owed, Owed requests a wallet-signed native Circle USDC transfer on Monad Testnet, then verifies the transaction receipt before marking it settled.

## Why it exists

Real conversations create multiple loose ends: debts, favors, requests, plans. Owed keeps them together rather than forcing the user into a wallet before they know what they owe. This is a distinct new product inspired by the upstream VoiceDebt project (https://github.com/ShalyX/voicedebt); its UI and payment workflow were developed for Monad.

## Running locally

Requires Node.js 22+ and an injected EVM browser wallet for payments.

1. Copy .env.example to .env.
2. Set HF_TOKEN in .env. Never commit this file.
3. In PowerShell, run: node --env-file=.env server.mjs
4. Open http://localhost:3000.
5. To run tests, use: npm run check

Without HF_TOKEN, the UI can display an explicitly labeled, nonpayable sample. Live transcription and text extraction need Hugging Face Inference credentials.

## What is implemented

- Paste any conversation and submit it to Gemma for structured obligation extraction with verbatim supporting quotes.
- Record microphone audio with MediaRecorder, or import an audio file under 18 MB; use Whisper then Gemma.
- Store the extracted obligations and source text in browser localStorage, with duplicate-source fingerprints.
- Split money owed, money owed to you, and ordinary tasks. Manual completion for non-payable items.
- Block model-generated wallet addresses. The user must independently verify and enter an EVM recipient address.
- Explicit checkbox, exact amount confirmation, wallet connection, automatic Monad Testnet switch/add.
- Wallet-signed USDC ERC-20 transfer to the canonical testnet token contract.
- Persist pending tx hash and recheck on reload. Require exact USDC Transfer event, payer, recipient, amount and successful receipt before displaying settled.

## Payment network

Monad Testnet: chain ID 10143; RPC https://testnet-rpc.monad.xyz.
Circle USDC testnet contract: 0x534b2f3A21130d7a60830c2Df862319e593943A3 (6 decimals).
Explorer: https://testnet.monadvision.com.
Users need testnet MON for gas plus Circle testnet USDC.

**Honesty boundary:** Code/test verification is not a proven funded transaction. The repository currently contains NO verified live transaction hash. Do not claim one until funded wallet execution is tested and the chain receipt independently checked.

## Security and privacy limits

- Model output is advisory; it cannot initiate a payment or select a recipient wallet.
- The server never collects wallet signing credentials, and has no server-side payment execution endpoint.
- Source evidence must be an exact substring; extracted monetary amount must be explicitly present in that quoted evidence.
- The app uses browser localStorage, not an auditable server-side ledger; it is not tamper-resistant, cross-device or encrypted.
- Analysis data/audio goes to Hugging Face. Server does not deliberately store the files, but model-provider processing applies.
- Browser wallet confirmations and a local verified-receipt view do not establish legal payment obligations or recipient identity.
- Testnet only. No real-value transfers supported in this MVP.

## What comes after the verified end-to-end payment

Test with genuine audio and external wallets, improve ambiguous money detection, build installable PWA share-target support for supported messages/audio (Android first), then polish and record a real demo.

## Upstream

Owed was developed by adapting the broad Whisper/Gemma transcription approach from VoiceDebt, without replacing or mutating that repository.

## Live verification workflow (October 8)

**Local model setup:** Edit `C:\Users\USER\owed-monad\.env` in Notepad (or double-click `SETUP-HF.cmd` to open it). Replace the blank `HF_TOKEN=` with `HF_TOKEN=hf_your_actual_token`, keeping the model lines unchanged. Save the file. The `.env` file is Git-ignored; never paste tokens into chat or commit them. The running Owed server checks for a newly saved token on analysis requests, so restart is unnecessary. No custom token-validation dialog is required.

**Real-model tests:** From PowerShell in this repo, run `npm run test:live -- tests/voice-smoke.wav`. The audio fixture is a small synthetic speech recording generated on the PC (ignored by Git). This command calls the actual Hugging Face Gemma and Whisper services and fails if either response is unavailable. Accept Google's Gemma model terms on Hugging Face and ensure the HF token has Inference Providers permission if the response is 403. Provider credits or quota may apply.

**RPC proof:** `npm run probe:monad` checks chain identity, deployed USDC bytecode and the 6-decimal token interface using a live public Monad Testnet RPC. This is infrastructure verification, NOT a settled payment.

**First actual payment (browser wallet):**
1. Open `http://localhost:3000`, connect an injected browser EVM wallet (e.g. MetaMask or Rabby) and use Monad Testnet.
2. Fund the connected address with faucet MON for gas from https://faucet.monad.xyz/ and Circle testnet USDC from https://faucet.circle.com/ (select Monad Testnet). Faucets may require user interaction.
3. Paste a real small debt message, e.g. `You still owe me 0.01 USDC for coffee.`, and analyze with real Gemma. Do not use the nonpayable sample card.
4. Open Pay, supply a recipient testnet address confirmed independently by the user, check the verification box and approve the exact USDC transfer in the wallet.
5. Wait for Owed to mark **Settled** only after it sees the exact matching ERC-20 Transfer event on a successful transaction receipt.
6. Independently verify using `npm run verify:payment -- 0xTXHASH 0xPAYER 0xRECIPIENT 0.01`. The verifier checks Monad Testnet chain ID, the signed transaction's USDC destination and exact calldata, receipt status, and Transfer event fields before printing VERIFIED.

**Current evidence:** Automated tests and the public-RPC token probe are passing. Real Whisper/Gemma inference and a funded USDC transfer are still pending local token configuration and wallet-funded signing. Never substitute synthetic responses or a mock receipt for this milestone.
