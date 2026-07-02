# Prompt for the zirtola.com agent — Licensing tiers (trial + subscriptions)

Copy everything below the line into the session that manages zirtola.com.

---

We are adding licensing tiers to Zirtola (the desktop app). The app is moving
from "license key required to run" to a **reverse trial**: one-click 7-day full
Pro trial (no key, no card), then auto-downgrade to a limited Free tier, with
paid Pro licenses/subscriptions unlocking everything. The desktop app is
already built against the contract below — implement the server side exactly
as specified.

## What already exists and MUST NOT change

- `POST /api/licenses/activate`, `POST /api/licenses/validate`,
  `POST /api/licenses/deactivate` — request/response shapes stay exactly as
  they are today.
- The Ed25519 signing key. Every 200 response is signed: base64 Ed25519 over
  the canonical JSON of the response object minus the `signature` field, in
  the exact key order the server serializes. The app verifies against the
  embedded public key — any change breaks every installed client.
- The signed payload shape:
  `{valid, key, product, productName, type, expiresAt, maxActivations,
  seatsUsed, issuedAt, signature}`.
- Existing error codes over HTTP 4xx with `{valid:false, error:"<code>"}`:
  `invalid_key | revoked | expired | activation_limit_reached | not_activated
  | missing_fields`.

## New endpoint: `POST /api/licenses/trial`

Body: `{ "machineId": "<sha256 hex>", "machineName": "<optional string>" }`

Behavior:
1. **First call for a machineId**: create a trial license bound to that
   machine and return HTTP 200 with the standard signed payload:
   - `type: "trial"`
   - `expiresAt`: ISO8601, exactly **7 days** from creation
   - `key`: a generated key with a distinct prefix, e.g. `TRIAL-XXXXX-XXXXX-…`
   - `maxActivations: 1`, `seatsUsed: 1`
   - The trial is implicitly activated on that machineId (no separate
     activate call needed; `validate` for that key+machineId must succeed).
2. **Repeat calls with the same machineId while the trial is active**:
   idempotent — return the SAME trial license with the SAME `expiresAt`.
   Never reset or extend the window.
3. **Calls after that machine's trial has expired** (or if a trial was ever
   issued and is no longer valid): return HTTP 403
   `{"valid": false, "error": "trial_already_used"}`. One trial per machine,
   ever. (This is the new error code — add it to the registry.)
4. `missing_fields` (400) when machineId is absent.
5. Trial keys must never interact with paid seat accounting.

## Changes to `validate`

- Must work for trial keys: while the trial is active return the signed
  payload (`type:"trial"`, original `expiresAt`); after `expiresAt` return
  HTTP 4xx `{"valid": false, "error": "expired"}`.
- The app treats an expired **trial** as "downgrade to Free" and an expired
  **paid** license as "renew" — same error code, the app branches on the
  cached license type, so no server change needed beyond correctness.

## Subscriptions (paid Pro)

- Paid keys are backed by Stripe subscriptions. `validate` returns the signed
  payload while the subscription is active; once it lapses (after any grace
  period you choose), `validate` returns `expired`. On chargeback/fraud use
  `revoked`.
- `type` for paid keys: anything other than `"trial"` (e.g. `"standard"`,
  `"subscription"`); the app treats any valid non-trial license as Pro.
- Checkout and self-service management live at
  `https://www.zirtola.com/account` (the app already links there). Also
  create a public `https://www.zirtola.com/pricing` page — the app links to
  it from upgrade prompts.
- Stripe webhooks (created/renewed/cancelled/payment_failed) are entirely
  server-side; the desktop app only ever calls `validate`.

## Non-negotiables

- 5xx / malformed responses are shown to users as "server unavailable, try
  again" — never as a bad key. Keep server errors as real 5xx, license
  problems as 4xx with a registered error code.
- Never return an unsigned or differently-signed 200 — the app hard-rejects
  it.
- machineId is an opaque sha256 hex string; store it, never try to decode it.

## Acceptance tests

1. `POST /trial` (fresh machineId) → 200 signed, `type:"trial"`, expiresAt =
   +7d, valid signature.
2. Same call again → 200 with identical key + expiresAt.
3. `POST /validate` with the trial key + same machineId → 200 while active;
   `expired` after expiresAt passes.
4. `POST /trial` after expiry → 403 `trial_already_used`.
5. Paid flow: Stripe subscription → key validates; cancel subscription →
   validate returns `expired` after grace.
6. All 200s verify against the existing public key
   (`GET /api/licenses/public-key` unchanged).
7. Provide a way to force-expire a specific trial (admin/manual is fine) so
   the desktop team can test the downgrade path without waiting 7 days.
