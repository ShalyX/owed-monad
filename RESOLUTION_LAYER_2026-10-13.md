# Owed — Resolution Layer (13 October 2026)

## Implemented
- Corrections preserve original evidence, change history, and clear any prior source support before another action can be considered.
- A corrected, outstanding **single-person** money obligation offers **Recheck source**. This is a separate source-only server check, not a self-attestation and not onchain validation.
- The server independently analyzes the immutable original transcript and original evidence, checks exact amount, direction, perspective, source grounding and safety context. A group chat, fabricated amount, wrong direction, withdrawal, conditional payment, settlement language, or unresolved competing amount fails closed.
- Source rechecks are same-origin, rate limited and do not contact a wallet or private model. Rechecks that cannot find an exact explicit request preserve the non-payable state.
- A supported request returns to `open`, **source rechecked, still unpaid**. Recipient ownership and real-world debt are not verified.
- Immediately **before requesting wallet access for an edited obligation**, Owed fetches a *fresh* server source evaluation and checks that the amount, direction, and hash still match the saved recheck. A failed or unavailable check blocks the payment before wallet authorization.
- Reviewed money supports separate meanings:
  - `needs_review`: corrected, awaiting source evidence, no Pay.
  - `user_handled`: user says handled outside Owed; **not** onchain verification.
  - `dismissed`: user excludes item; not paid.
  - `conversation_confirmed`: someone acknowledged payment in chat; not chain proof.
  - `open` with sourceVerification: original wording supports a request; still unpaid, any USDC transfer requires recipient verification and wallet confirmation.
  - `pending`/`submitting`/`settled`: wallet states; only a matching onchain receipt shows **Verified onchain**.
- Handled/dismissed manually corrected money can be explicitly reopened to `needs_review`, never immediately to a payable state.
- Group payments remain blocked, including previously stored obligations.

## Limitations and safety
- Source text is user-provided evidence and **not proof** of wallet ownership, legal obligation, or actual transfer. The text check is conservative and may reject legitimate complex conversations; users must confirm with the person involved.
- A plain conversation cannot verify onchain payment. No mark-handled action supplies a transaction receipt.
- Inference/extraction from complex real-world chats is still fallible. Group financial execution is not enabled by this release.
- The source verifier does not store conversation data server-side; browser localStorage still retains the saved inbox and edit trail.

## Test and verification
- Unit tests include direct grounded money, invented amount, invented source, reversed direction, conditional payments, withdrawal, recorded settlement, group rejection, origin/quota protections, corrected money lifecycle, and edits invalidating prior support.
- End-to-end browser scripts exercise fresh source recheck, rejected unsupported amounts, nonpayable manual states, recipient review, recovery and refresh persistence. They do not sign or broadcast a new blockchain transaction.
