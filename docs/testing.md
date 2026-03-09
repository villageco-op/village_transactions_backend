# Testing

Tests run automatically in CI and block merges on failure.

Flaky tests are **top priority** and must be fixed immediately.

---

## Test Requirements

| Change                   | Required Test     |
| ------------------------ | ----------------- |
| Business logic           | Unit tests        |
| New API endpoint         | Integration tests |
| Auth / Signup / Payments | E2E tests         |

---

## Test Types

### Unit Tests

Framework: **Vitest**

Rules:

- mock all external dependencies
- test one behavior per test
- clear naming

Example:

```

should_return_user_when_id_exists

```

---

### Integration Tests

Test API routes with real dependencies where appropriate.

---

### E2E Tests

Run on **merge to main**.

Framework:

- Playwright

Critical flows tested:

- login
- signup
- payments
- checkout

---

## CI Execution

Pull Request:

```

unit tests
integration tests

```

Merge to `main`:

```

E2E tests

```
