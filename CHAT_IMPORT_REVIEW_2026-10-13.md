# Owed: Chat Import and Evidence-Backed Corrections

## Implemented
- Paste a WhatsApp-style exported chat or choose a plain-text .txt file from the Import tab. Android and iOS timestamp formats, names, and multiline continuations are normalized in the browser before analysis.
- Speaker selection is mandatory for recognized multi-person chats. WhatsApp system notices are skipped, while original exported text, timestamps, and line references are retained in the browser group record for review.
- No chat history is silently truncated: inputs beyond 12,000 normalized characters are rejected with a message to select a shorter excerpt. The file import itself is capped at 80 KB; no ZIP, media attachment or network URL is opened.
- The original export is stored locally (browser localStorage), but normalized content is sent to the Owed server for extraction. Chat analysis is **not local-only**; the user's prior privacy explanation remains accurate.
- Each unsettled money or task card has a Correct action. The review dialog displays **immutable original evidence** and allows changing title, money amount, direction and locally recorded state, with an optional correction note.
- A chronological, browser-local reviewHistory stores before/after values. Corrections never rewrite the original quote and never count as verified onchain payments.
- Manually corrected money becomes review-only, including when marked handled; it cannot initiate the USDC wallet flow. Pending, failed, submitting, reviewing, or verified payment transactions cannot be edited.
- Speaker changes require reanalysis with a newly selected participant. Existing historical chat evidence is not silently relabelled. Group payments remain completely disabled.
- Independent task items retain their own editable title/status, with separate completion.

## Limits
This release parses common WhatsApp text exports, not every messenger's export schema. Some date/locale combinations, contact aliases, deleted messages, or forwarded snippets may remain ambiguous. Speaker names are claims from the export, not identity proof. User corrections update a private browser record, not the underlying message or blockchain.

## Test protocol
- 6 new parser/review unit tests cover Android/iOS chat text, multiline messages, truncated-export rejection, immutable evidence, action history, numeric precision, protected receipt states and separate tasks.
- Existing Owed suites must continue to pass.
- Live HTTPS browser test covers import preview -> participant selection -> group money item -> manual edit -> no group Pay -> refresh persistence -> change speaker. It never signs or broadcasts a transaction.
