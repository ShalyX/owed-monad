# Monad Metropolis — Owed Portal Fields

**Submission portal:** https://hackathon.monad.xyz/  
**Deadline:** October 13, 2026, 11:59 PM Eastern Time (approximately October 14, 4:59 AM Africa/Lagos).  
**Authentication:** Continue with the same GitHub, Google, or Discord provider used at registration. A logged-in human must review and click the final portal submission action.

## Paste-ready fields

**Project name:** Owed

**Track:** Consumer Products & Payments

**Short tagline:** From conversations to completion.

**Short description:**
Owed turns a one-to-one message or voice note into clear to-dos and money obligations. Review each source quote, correct mistakes, finish independent tasks, or choose to settle an eligible request with USDC on Monad Testnet. Nothing is paid automatically; only a matching onchain receipt is labelled verified.

**Problem:**
Everyday conversations create debts and small promises that disappear into chat history. Wallets move money but don't explain what was agreed, and task managers require someone to manually copy each loose end. People need a simple bridge between a reminder, the actual action, and reliable proof of completion.

**Solution:**
Owed accepts a pasted message or voice note, identifies money and distinct tasks, and keeps each attached to its original evidence. Users review and correct the results rather than trusting extraction blindly. Optional USDC settlement requires an independently confirmed recipient and a separate wallet approval on Monad Testnet. The app checks the transaction, ERC-20 transfer event, amount, payer and recipient before marking it verified onchain. Manual task completion and chat acknowledgements are kept separate from blockchain proof.

**Why Monad / blockchain integration:**
Monad Testnet provides the verifiable last step of Owed's workflow. A real wallet-approved transfer of Circle Testnet USDC is confirmed using onchain transaction and receipt data. Owed cannot silently send tokens, choose a recipient for the user, or fabricate an onchain settlement.

**What is new / originality disclosure:**
Owed is a new product developed during the Metropolis build window, influenced by earlier VoiceDebt work around voice-note understanding. Owed's payment approval flow, Monad Testnet USDC transfer integration, strict receipt verification, recovery logic, financial source checks and focused consumer interface were built for Metropolis. AI coding and testing assistance was used, and the provenance is visible in the public repository history.

**Technology:**
Node.js, JavaScript/HTML/CSS, Whisper-based private voice transcription, Qwen2.5-based private text inference, browser localStorage, injected EVM browser wallet, Circle USDC ERC-20 on Monad Testnet (chain ID 10143), Monad RPC transaction and receipt verification.

**Demo URL:** https://owed-monad.tail5a7dd1.ts.net/

**Current technical demo (1m 16s):** https://owed-monad-submission-videos.vercel.app/technical.mp4
**Prior narrated walkthrough (1m 45s):** https://owed-monad.tail5a7dd1.ts.net/owed-metropolis-demo.mp4

**GitHub URL:** https://github.com/ShalyX/owed-monad

**Onchain evidence:** https://testnet.monadvision.com/tx/0x1b2bf93586941a3e9126081e3ac97c950e52ece2b1a71cd4705ed96e370e371f

**Network category:** Monad Testnet.

**Smart contract / token used (if asked):** Circle testnet USDC, `0x534b2f3A21130d7a60830c2Df862319e593943A3`. This is an existing ERC-20 token contract **used for transfers**, not a contract authored or deployed by Owed. If the form specifically asks for *your deployed contract address*, answer “not applicable — wallet-signed ERC-20 transfer using existing Circle testnet USDC”; do not misrepresent Circle's contract as your deployment.

**Sponsor bounties:** None claimed without a verifiable integration meeting that sponsor's actual criteria. Primary submission is the Consumer Products & Payments track.

## What judges can verify

The 1m 45s video shows the live Owed app with a one-to-one message, two separate cards, the untouched recipient-confirmation gate, task completion, original-evidence correction, and reported-third-party debt protection. A separate card clearly labels the earlier independently checked real **0.01 USDC** Monad Testnet transaction—**not a newly sent payment during the recording**.

The app runs on a public HTTPS URL without requiring a wallet or Tailscale account just to explore the UI. A real new transfer requires the judge's own Monad Testnet wallet and testnet assets. No mainnet or custodial payment capability is claimed.

## Final portal checklist

- [ ] Sign in at the official portal under the registered provider and open your project submission.
- [ ] Enter the project title, selected track and short description.
- [ ] Provide app, GitHub and public demo-video URLs.
- [ ] Include the previous verified transaction link where technical/onchain evidence is requested.
- [ ] Accurately disclose VoiceDebt inspiration and AI-assisted development if the portal asks.
- [ ] Review all answers and press **Submit** before October 13 at 11:59 PM ET.
- [ ] Capture/retain the submission confirmation URL, email, or screenshot.

**Submission status:** This file is a completed submission kit, **not** a confirmation that the authenticated portal entry has been submitted.
