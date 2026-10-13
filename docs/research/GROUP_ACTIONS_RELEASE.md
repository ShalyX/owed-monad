# Owed — Group Identity and Atomic Tasks

## Release behavior
- Pasting **speaker-labelled conversations** (at least two distinct names on labelled lines) reveals a participant selector. No name is selected automatically.
- The server independently validates the selected name against the actual speaker labels. Unknown or absent selection returns HTTP 422, before any model inference or saved obligation.
- Selecting **I'm not a participant** produces no personal debt or tasks.
- The group-specific resolver treats each labelled turn as a distinct speaker. Only requests *explicitly addressed to the selected participant* are actionable. Amounts another member paid, a group total, inferred equal split, or someone else's promise are not automatically assigned to the user.
- Explicit named incoming debts (e.g. "Alex, I still owe you $7.50") are recorded as **owed to you**, never as outgoing Pay.
- Group resolution is intentionally conservative and source-grounded; it does not call the 0.5B model to guess which named person is "you." Wallet ownership is **not** verified by a speaker label; user-selected identity is a claim only.
- A named direct money request can open **Pay in USDC** only after separate recipient verification and signed wallet approval, with the existing onchain receipt checks unchanged.

## Individual actions
- A compound delivery instruction, such as "send the flyer and the location link," is represented as **two independently completable tasks** with separate task IDs and task keys, even when the small model returns one combined card.
- A finished task does not complete its sibling. A reload preserves each task's own status.
- Previously saved **open** combined tasks are separated in the user's browser; **completed** tasks and onchain payment records are kept unchanged. Reanalysis deduplicates by task identity, not shared evidence alone.
- The same sentence may be quoted under two distinct tasks so a user can verify both; each title identifies the separate object.

## Boundaries and follow-up
- This release supports explicitly **speaker-labelled** transcripts and directly named addressees. It deliberately abstains on implied addressees, aliases, unnamed readers, absent participant labels, and group-bill calculations unsupported by a direct request.
- It is not a proof of who controls a wallet or who legally owes money. Users choose the participant and verify the evidence before acting.
- Coordinated tasks currently cover one delivery verb and two concrete objects linked by **and**. Nested instructions and implied action ownership still require review.
- A group result with no actionable item is **not proof nothing is owed**.
- No onchain transfer is triggered by extraction, identity selection, or checking tasks.

## Checks
- Unit/API suite: participant detection, identity required, observer, Alex/Kemi/Zara taxi directions, Airbnb Shaly/Tunde isolation, named money owed to user, cancellation/conditions, two task records, safe migration, and idempotent reanalysis.
- Full existing repository checks and wallet recovery smoke must continue to pass.
- A fresh public HTTPS browser run must demonstrate identity selection, wrong-party isolation, one task completed without completing the other, and reload persistence.

This does not replace the 11 October blind benchmark: its group-chat example lacked a specified listener identity and was correctly considered underspecified.
