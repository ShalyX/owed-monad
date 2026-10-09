# Owed · Public demo runbook

**Public HTTPS:** https://owed-monad.tail5a7dd1.ts.net/

**Current state (October 9, 2026):** Public HTTPS, live private AI
inference, separate Money and To-do cards, and payment review safety
controls passed. A real wallet-approved USDC transfer and independently
verified onchain receipt on this exact origin remain a final user-led test.

Owed is a **Monad Testnet pilot**, not a production payments service.
Tailscale Funnel remains beta, and availability depends on our VPS.

## Architecture

Browser → Tailscale Funnel HTTPS → 127.0.0.1:3001 (Node)
→ 127.0.0.1:18765 (authenticated private inference worker)
→ 127.0.0.1:11434 (private Ollama)

Funnel was started with: **tailscale funnel --bg --yes 3001**.

Judges do not need Tailscale accounts. Keep all app and inference
ports bound to loopback. Never expose worker or Ollama directly.

The previous Cloudflare Quick Tunnel is a temporary migration preview,
not the submission URL. Verify its service state before assuming it is
retired.

## Verify the deployment

Run on the VPS:

    systemctl is-active tailscaled owed-app owed-inference ollama
    tailscale funnel status
    curl -fsS http://127.0.0.1:3001/health
    curl -fsS https://owed-monad.tail5a7dd1.ts.net/health
    cd /opt/owed-app
    /opt/owed-worker/node --test tests/*.test.mjs
    OWED_PUBLIC_URL=https://owed-monad.tail5a7dd1.ts.net/ /opt/owed-worker/node scripts/public-browser-smoke.mjs

The real-browser test checks secure HTTPS, real text inference, one
Money item and one distinct To-do, an accurate USDC review amount,
no guessed recipient, and refusal to send without recipient verification.
It does not sign a transaction.

## Security and privacy boundaries

- No automatic transfers. The user chooses and independently verifies
  the recipient and confirms the transaction in their own EVM wallet.
- Source conversations, decisions and saved receipts remain in browser
  localStorage. It is not encrypted or cross-device. Supplied text and audio
  are processed on the private VPS, so do not claim offline-only analysis.
- No server-side signing keys or wallet transfer execution endpoint.
- Public demo mode caps analysis at 12 requests per hour per **observed**
  client IP, one simultaneous analysis per observed client, and two globally.
  Receipt lookups have a separate limit. Reverse proxies can cause several
  clients to appear as one IP; these controls are best effort, not a
  substitute for robust identity or DDoS controls. Limits reset on restart.
- Cross-site analysis POSTs are rejected. App responses use no-store cache.
- This is Monad Testnet only; funds and gas must be testnet assets.
- Qwen and Whisper can misinterpret or mistranscribe. Review source text.

## Remaining real-wallet acceptance test

A consenting wallet owner must:

1. Open the public Tailscale URL in a fresh browser.
2. Analyze an actual payment request; confirm amount, perspective and quote.
3. Independently verify a recipient on Monad Testnet.
4. Ensure tiny balances of Circle Monad Testnet USDC and test MON.
5. Confirm a small transfer in the injected wallet.
6. Preserve the transaction hash and verify the successful receipt, token
   contract, sender, recipient, amount, and Transfer event onchain.
7. Check the Owed receipt modal and persisted state after reload.
8. Test a rejected wallet signature and insufficient-balance case.

Do not claim a particular funded transfer passed unless its authentic
receipt has been checked. Automated smoke tests do not simulate settled
funds or sign on behalf of a user.

## Operational notes

If the public site fails, check the VPS app health, Funnel configuration,
tailscaled service, DNS and TLS, then the tailscaled journal. This ts.net
hostname remains stable for the registered tailnet/device unless that
registration or configuration changes. Funnel is beta, not an uptime SLA.
