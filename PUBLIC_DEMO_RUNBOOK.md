# Owed · Public demo runbook

This is a **Monad Testnet pilot**, not a public production payments service.
The public HTTPS preview is provided by a Cloudflare Quick Tunnel, whose
random hostname may change after any restart or network interruption.
**Never submit that hostname as the permanent hackathon URL.**

## Architecture

Browser -> Cloudflare HTTPS Quick Tunnel -> 127.0.0.1:3001 (Node app)
-> 127.0.0.1:18765 (private authenticated inference worker)
-> 127.0.0.1:11434 (private Ollama)

- The app and inference worker are still bound to localhost on the VPS.
- No wallet private keys, signing sessions, or verified receipts are server-managed.
- The wallet signs a USDC transfer only after the user chooses the recipient,
  independently verifies the address, and confirms in their EVM wallet.
- Browser localStorage stores user-side conversations and decisions. Analysis
  sends the supplied text/audio to the private VPS for processing. Do not
  claim the entire experience is entirely offline or private from the server.
- The release does not change other existing VPS services.

## Check the preview

On VPS:

```bash
systemctl is-active owed-app owed-inference ollama owed-demo-tunnel
curl -fsS http://127.0.0.1:3001/health
journalctl -u owed-demo-tunnel --no-pager -n 150 -o cat \
  | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1
```

The URL above is **ephemeral**. Cloudflare Quick Tunnels are explicitly
for tests/dev and have no uptime guarantee.

With the current temporary HTTPS URL substituted:

```bash
curl -fsS https://YOUR-PREVIEW.trycloudflare.com/health
OWED_PUBLIC_URL=https://YOUR-PREVIEW.trycloudflare.com/ \
  /opt/owed-worker/node scripts/public-browser-smoke.mjs
/opt/owed-worker/node --test tests/*.test.mjs
```

The browser script checks HTTPS, real text inference, cards for a money request
and an independent to-do, and the wallet confirmation guard. It deliberately
does **not** simulate a successful transfer, produce a fake receipt, or sign.

## Rate and privacy guards

On the VPS, the systemd drop-in
`/etc/systemd/system/owed-app.service.d/public-demo.conf` enables
`OWED_PUBLIC_DEMO=1`. The in-process request gate caps:
- analysis attempts: 12 per hour per observed client IP;
- active analyses: 1 per client and 2 globally;
- receipt lookups: 45 per minute per observed client IP.

These are **best-effort protections, not identity/authentication or a
guaranteed DDoS defense**. They reset at restart and do not protect against
distributed attackers. Reject cross-origin POSTs and keep response headers
`Cache-Control: no-store`. Never expose ports 18765 or 11434.

## Before sending judges a permanent link

1. Configure a **named Cloudflare Tunnel** on a zone/domain controlled by the
   owner, using a stable HTTPS hostname for Owed. Do not replace other tunnel
   or web services. Keep the app bound to loopback.
2. Stop/disable `owed-demo-tunnel.service` only **after** the named tunnel
   passes real browser and live inference tests, or keep it temporarily while
   migrating.
3. Exercise the whole journey with an actual external user's browser wallet:
   capture -> review -> verify recipient independently -> choose to pay ->
   approve a small **Monad Testnet Circle USDC** transaction in the wallet ->
   independently check tx receipt, payer, recipient, amount, and token ->
   verify the receipt modal and surviving reload state. Do not claim this
   worked on a specific transaction unless its hash was actually checked.
4. Test fresh browser and mobile layouts on the permanent URL.
5. Confirm demo stability, free inference capacity, TLS, transcript limitations,
   testnet-only warnings, and no accidental claims of production use.

## Limits worth mentioning

- Temporary tunnel URL changes on restart; named tunnel/domain still required.
- Browser localStorage is not encrypted, transferable, or tamperproof.
- On-device Whisper and Qwen may mis-transcribe or misunderstand; source review
  before paying is mandatory.
- An untrusted chat quote must never count as wallet identity verification.
- The VPS is resource-constrained. Production-scale inference would need
  capacity planning and stronger edge protection.
