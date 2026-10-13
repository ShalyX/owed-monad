# Advanced setup and historical verification notes

These notes preserve engineering detail formerly embedded in the project README. They span earlier hackathon iterations and may describe outdated release state. Refer to [the current README](../../README.md) and [public operations runbook](../../PUBLIC_DEMO_RUNBOOK.md) for the current product and verified evidence.

---

## Live verification workflow (October 8)

**Local model setup:** Edit `C:\Users\USER\owed-monad\.env` in Notepad (or double-click `SETUP-HF.cmd` to open it). Replace the blank `HF_TOKEN=` with `HF_TOKEN=hf_your_actual_token`, keeping the model lines unchanged. Save the file. The `.env` file is Git-ignored; never paste tokens into chat or commit them. The running Owed server checks for a newly saved token on analysis requests, so restart is unnecessary. No custom token-validation dialog is required.

**Real-model tests:** From PowerShell in this repo, run `npm run test:live -- tests/voice-smoke.wav`. The audio fixture is a small synthetic speech recording generated on the PC (ignored by Git). This command calls the actual Hugging Face Gemma and Whisper services and fails if either response is unavailable. Accept Google's Gemma model terms on Hugging Face and ensure the HF token has Inference Providers permission if the response is 403. Provider credits or quota may apply.

**RPC proof:** `npm run probe:monad` checks chain identity, deployed USDC bytecode and the 6-decimal token interface using a live public Monad Testnet RPC. This is infrastructure verification, NOT a settled payment.

**First actual payment (browser wallet):**
1. Open `https://owed-monad.tail5a7dd1.ts.net/` with an injected browser EVM wallet (e.g. MetaMask or Rabby) and use Monad Testnet. A local development server can alternatively run at `http://localhost:3000`.
2. Fund the connected address with faucet MON for gas from https://faucet.monad.xyz/ and Circle testnet USDC from https://faucet.circle.com/ (select Monad Testnet). Faucets may require user interaction.
3. Paste a real small debt message, e.g. `You still owe me 0.01 USDC for coffee.`, and analyze with the configured inference provider (the private VPS uses Qwen2.5). Do not use the nonpayable sample card.
4. Open Pay, supply a recipient testnet address confirmed independently by the user, check the verification box and approve the exact USDC transfer in the wallet.
5. Wait for Owed to mark **Settled** only after it sees the exact matching ERC-20 Transfer event on a successful transaction receipt.
6. Independently verify using `npm run verify:payment -- 0xTXHASH 0xPAYER 0xRECIPIENT 0.01`. The verifier checks Monad Testnet chain ID, the signed transaction's USDC destination and exact calldata, receipt status, and Transfer event fields before printing VERIFIED.

**Current evidence:** Automated tests, a live private Whisper + Qwen voice-to-obligation smoke test, and the public-RPC token probe have passed. The user reported an actual Monad Testnet USDC transfer through the app; its private transaction details are not reproduced here. Never substitute synthetic responses or a mock receipt for independently verified on-chain evidence.

## Zero-cost VPS inference (private test lane)

This project supports a paid Hugging Face mode for reference, but our current working lane uses **no paid inference**:
- `faster-whisper` with `base.en` (int8 CPU) for better conversational speech recognition. It uses more memory than `tiny.en`; test resource limits when moving to a different VPS.
- Ollama `qwen2.5:0.5b` for structured obligation extraction. This is NOT Gemma; it requires careful human review.
- `scripts/inference-worker.py` listens on `127.0.0.1:18765`, requires `OWED_WORKER_TOKEN` bearer authentication, and serializes work (one request at a time). The official model server listens on `127.0.0.1:11434`. Neither port is public.
- `scripts/install-vps-worker.sh` provisions a dedicated unprivileged user and a memory/CPU-capped systemd worker; the token is generated and stored on the VPS at `/etc/owed-inference.env`, **never in GitHub**. The VPS Ollama service also has its own CPU/memory cap in `/etc/systemd/system/ollama.service.d/owed-limits.conf`.
- Owed's Node server can be colocated on the VPS with `LOCAL_INFERENCE_URL=http://127.0.0.1:18765`, loading the auth token via `EnvironmentFile=/etc/owed-inference.env`. Use `HOST=127.0.0.1` and forward its web port through SSH when testing from your PC; do not expose the HTTP port to the internet without adding HTTPS and application auth.
- To forward: `ssh -N -L 127.0.0.1:3001:127.0.0.1:3001 caraxes-vps`. Open `http://localhost:3001` on the PC. Wallet authorization still occurs in the user's own injected wallet.

**Financial-context safety:** A clearly phrased request for financial help is stored as a voluntary Money request—not an existing debt. It does not increase the "You owe" total, and any optional transfer requires independent recipient verification plus wallet signing. The same Money / To-dos interface also distinguishes conditional payments (not yet owed), supported corrections (new amount supersedes old), and explicit equal splits (only the individual share, never the full group total). Ambiguous corrections, splits, and fractional shares are not payable. Previously saved money items are also rechecked before the Pay modal and wallet authorization; verified receipts and completed tasks are not rewritten. The source quote and any calculation stay visible for review. These are conservative safeguards, not full conversational understanding.

**Safety:** No AI-generated recipient address is trusted; source quotes are verified against the actual transcript. Money/transcription ambiguity requires review, and transfers always require explicit wallet confirmation and on-chain event verification. A 0.5B model is not production-grade reasoning; never auto-pay.

**Troubleshooting:** `faster-whisper` 1.2.1 currently needs `av<19`; PyAV 19 dropped the `metadata_errors` argument its decoder uses. Audio weights are downloaded once for free from Hugging Face Hub (not billed inference). The VPS is resource-constrained; if model processing times out or would disturb running services, scale down or disable the worker rather than kill unrelated services.

### Verified VPS pilot

As of 2026-10-08, `caraxes-vps` runs two *private loopback-only* systemd services: `owed-inference.service` on `127.0.0.1:18765` and `owed-app.service` on `127.0.0.1:3001`. Ollama is loopback-only on `127.0.0.1:11434`. All three have resource limits. Other existing VPS services have been left running.

On the authorized Windows PC, double-click **`CONNECT-VPS.cmd`** to open a private SSH tunnel and the live app at **http://localhost:3001**. Browser wallets remain entirely on the PC. If the SSH tunnel closes or the PC restarts, run the shortcut again. This is a private pilot, not a public HTTPS deployment.

The live synthetic smoke test is `/opt/owed-worker/node /opt/owed-app/scripts/test-vps-e2e.mjs` (run over SSH). It requires a real Qwen text response and actual Whisper transcription; the strict source-quote validation and conservative literal-debt fallback work together. Explicit amounts written as number words may be extracted when grounded in a direct source quote. Ambiguous amounts such as "two fifty" remain unpriced and require human correction. All extracted voice requests must be checked against the visible transcript before payment.

**Still unproven:** An actual funded Circle USDC transfer from a user's browser wallet followed by an independently matched Monad receipt. The automated chain/receipt unit tests do not substitute for this.
