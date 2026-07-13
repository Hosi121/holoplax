# Personal Delegation

`/delegate` is a vertical slice for delegating a small personal job from a
natural-language request through a verified, persisted result.

## User contract

- Safe research, organization, and writing requests start automatically.
- Every request becomes a durable job and remains visible across reloads.
- A generated artifact is not marked complete until a second verification
  pass checks it against explicit completion criteria.
- External, destructive, or irreversible requests wait for the user. The user
  can request an artifact-only draft, but this does not authorize the external
  operation.
- Requests that appear to contain credentials, personal information, or other
  secrets are rejected before persistence and are not sent to the AI provider.
  The user must remove that material before submitting again.

## Layer boundaries

| Layer | Responsibility |
|---|---|
| Domain | Classify kind and risk; derive steps, completion criteria, and safe fallback |
| Application | Create/list/act use cases and provider-independent job runner ports |
| Infrastructure | Prisma commands, durable claim/retry queue, AI generation and verification |
| Interface | Authenticated API routes and the personal delegation workspace |

The deterministic domain policy is the authority for whether a request can
enter the queue. The model may produce and verify an artifact, but it cannot
lower risk or authorize an effect.

## Runtime behavior

`DelegationJob` uses compare-and-set claims (`PENDING` to `RUNNING`), a worker
owner token, bounded retries, stale-claim recovery, and terminal timestamps.
Canceling a running job prevents its eventual provider response from being
stored as a successful result. Queue failures and stale jobs contribute to the
health endpoint.

## Current capability boundary

The first executor only generates text artifacts. It has no filesystem,
browser, messaging, calendar, payment, deployment, or repository mutation
tools. The UI says this explicitly and offers a draft when that is safe.

To add real execution, implement a narrow application execution port per tool.
Each adapter must define:

1. its allowed operations and required user scope;
2. deterministic risk and approval rules;
3. an idempotency key and observable receipt;
4. timeout, retry, and compensation behavior;
5. a verifier that checks the receipt rather than the model's claim.

This keeps tool access additive: introducing a calendar or repository adapter
does not change the core job lifecycle or allow the model to bypass policy.
