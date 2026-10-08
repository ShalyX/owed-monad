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
