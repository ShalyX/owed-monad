# Owed — Monad Metropolis 2026 Submission

**Hackathon:** Monad Metropolis (September 1–October 13, 2026)  
**Track:** Consumer Products & Payments  
**Project:** Owed  
**Tagline:** *From conversations to completion.*  
**Live app:** https://owed-monad.tail5a7dd1.ts.net/  
**Source:** https://github.com/ShalyX/owed-monad  
**Network:** Monad Testnet, chain ID `10143`  
**Onchain proof:** https://testnet.monadvision.com/tx/0x1b2bf93586941a3e9126081e3ac97c950e52ece2b1a71cd4705ed96e370e371f  
**Demo video (narrated, 1m 45s):** https://owed-monad.tail5a7dd1.ts.net/owed-metropolis-demo.mp4

## Short description

Owed turns a one-to-one message or voice note into clear, independently completable tasks and money obligations. Users can review the source evidence, correct mistakes, and—if they choose—settle an eligible amount with Circle USDC on Monad Testnet. Nothing is paid automatically, and Owed only marks a transfer onchain-verified after checking the transaction and receipt.

## The problem

Small commitments disappear inside conversations: someone covers coffee, asks for a link, or reminds you about money owed. Task apps make people manually re-enter all this context. Wallets can transfer tokens, but they don't help answer what was actually agreed or whether a particular payment has already been resolved. It becomes too easy to forget a favor or settle the wrong amount.

## The solution

Owed connects natural-language reminders to **verifiable, user-controlled resolution**:

1. **Capture:** Paste one person's message, record a reminder, or import a voice note.
2. **Extract:** Whisper handles speech transcription; a private inference worker helps identify money and to-dos. Source text and separate source-safety checks remain visible.
3. **Review:** Each action has its own state. Users inspect the original quote, change the interpretation, or mark a non-payment task complete.
4. **Reverify:** A manually edited amount is not automatically payable. Owed checks the immutable source text for explicit support; uncertain, reported or third-party demands stay blocked.
5. **Settle:** For an eligible personal debt, the user separately supplies and verifies the recipient's address and confirms a wallet-signed Circle USDC transfer on Monad Testnet. Owed checks network, contract, transfer calldata, sender, recipient, amount, logs, and successful receipt before displaying **Verified onchain**.

The onchain portion is a **direct ERC-20 Circle Testnet USDC transfer**, not a custom smart contract, custodial balance or synthetic settlement.

## What works today

- Hosted HTTPS app with live private speech and text inference.
- Separate money and to-do cards, original quotes, local review history and persistent browser inbox.
- Explicit recipient-address review and wallet confirmation; no autonomous transfers.
- Monad Testnet USDC payment flow, pending/failed transaction recovery and strict successful-receipt validation.
- Verified example: **0.01 USDC**, transaction `0x1b2bf93586941a3e9126081e3ac97c950e52ece2b1a71cd4705ed96e370e371f` on chain `10143`.
- Group-chat extraction is intentionally excluded from the hackathon release. Old saved group records are review-only.
- The live model can make mistakes; safety checks prevent reported third-party claims from becoming personal Pay actions. The user must independently confirm the actual obligation and recipient.

## Why Monad

Owed treats the chain as the **resolution proof**, not the place where understanding happens. One-to-one conversations can generate an optional transaction, but only the wallet owner authorizes it, and only Monad Testnet's recorded token transfer can mark it onchain-verified. This makes the end of the workflow independently inspectable through a block explorer. Owed needs no custodial keys or intermediary ledger to assert that a wallet transfer occurred.

## Technical implementation

- **Frontend:** Plain HTML, CSS and JavaScript; local browser inbox.
- **Speech:** Whisper-based transcription on a private VPS.
- **Reasoning:** Small Qwen-based inference on a private VPS with deterministic financial safety and source verification; Hugging Face/Gemma is an optional developer lane.
- **Server:** Node.js; source analysis, validation, no server-side wallet signatures.
- **Payment:** Wallet-approved ERC-20 transfer of Circle USDC (testnet contract `0x534b2f3A21130d7a60830c2Df862319e593943A3`).
- **Verification:** Monad Testnet RPC, chain `10143`, full transaction and receipt, exact recipient/amount, transfer event, persistence and recovery on refresh.
- **Access:** HTTPS through Tailscale Funnel. The public demo requires no Tailscale account, but the owner-operated VPS and Funnel service must remain online.

## Originality and development-window disclosure

Owed was developed during the Metropolis build window as a new product, building on lessons and some transcription concepts from the earlier **VoiceDebt** project. VoiceDebt is an upstream inspiration for handling conversational reminders; **Owed's Monad Testnet USDC transfer approval, payment integrity, receipt verification, source-reverification, and payment-resolution flows were built for this hackathon**. The repository and its Git history document that progression.

AI-assisted development and testing were used. All onchain settlement evidence cited here comes from an actual existing Monad Testnet transaction, not a mock, fabricated receipt or claim of a new transfer in the submission demonstration.

## Judge walkthrough (2–3 minutes)

1. Open the live app. Paste: `You owe me $0.01 for coffee. Please send me the meetup address.`
2. Click **Find the loose ends**. Point out the separate money and task cards, their evidence, and that finishing a task doesn't settle the money.
3. Open **Pay in USDC**. Show the accurate amount and **empty recipient field / unchecked confirmation**. Do not send in the demo.
4. Close the dialog, complete the address task, and refresh to show the state persists.
5. Review the explorer proof from the earlier actual 0.01 USDC transfer. Clarify that it is **previously verified chain evidence**, not a payment performed by the current recording.
6. Optional safety check: paste `I overheard Jordan tell Maya 'you owe me $50'. I don't need anything from you.` Owed will not create an actionable payment for that third-party debt.

## Testing and limitations

Production deployment revision: `4a532e6`. All 184 automated tests passed on the VPS. A real public HTTPS browser confirmed extraction, optional payment review, an unapproved recipient gate, task completion and reload persistence. A live unsafe third-party $50 case was explicitly rejected; group submissions return HTTP 422. No new real payment was required for this release verification.

This is an experimental, **testnet-only** prototype, not a production financial service, and has not been validated with a large cohort of real users. Language extraction can be imperfect. Browser storage is not synchronized or encrypted. An onchain receipt verifies transfer activity, **not identity or legal liability**.

## Optional short social description

Your wallet can tell you whether $0.01 moved.

It can't tell you why you owed it, what else you promised, or whether the task beside it is done.

Built Owed for Monad Metropolis: conversations become reviewable money and to-dos. You approve any USDC transfer, and only a matching Monad Testnet receipt gets marked verified.

Live demo: https://owed-monad.tail5a7dd1.ts.net/
