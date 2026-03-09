# Contributing

## Pull Requests

### Title Format

```

TYPE(scope): description (TASKID)

```

Example:

```

feat(payments): implement idempotent Stripe webhook handling (VL-42)

```

**Rules**

- Keep PRs small and focused.
- If the title cannot summarize the change in one line, the PR is probably too large.

### Description

Briefly explain:

- **What changed**
- **Why it changed**

This helps future developers understand historical changes.

---

## Branch Naming

```

type/short-description-TASKID

```

Example:

```

feat/stripe-webhook-idempotency-VL-42

```

Rules:

- lowercase
- kebab-case
- include Jira ID

---

## Reviews

Every PR requires **at least one review** before merge.

Reviewers check:

- accidental files (temp/build/secrets)
- LLM artifacts (unnecessary comments, omitted sections)
- logic correctness
- error handling
- test coverage
- consistency with existing patterns
- security concerns

Reviewers **do not verify behavior manually** — tests should cover that.
