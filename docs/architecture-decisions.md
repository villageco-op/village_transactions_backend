# Architecture Decision Records (ADR)

Location:

```

docs/adr

```

ADRs record **important technical decisions and their reasoning**.

---

## When to Create an ADR

Create one when a decision:

- has a high cost of change
- affects multiple developers
- involves tradeoffs
- answers a recurring "why"

---

## Workflow

1. **Proposal**

Create a new ADR with status `Proposed`.

2. **Review**

Team discussion occurs in the PR.

3. **Accepted**

Status updated to `Accepted`.

4. **Superseded**

If replaced later, create a new ADR referencing the previous one.

Never delete old ADRs.

---

## ADR Template

```

# Decision Title

## Context and Problem Statement

What problem is being solved?

## Considered Options

* option A
* option B
* option C

## Decision Outcome

Chosen option and why.

```

---

## Referencing ADRs in Code

Example:

```ts
/**
 * @remarks
 * See ../docs/adr/003-idempotency.md
 */
```
