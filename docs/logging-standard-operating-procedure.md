## Logging Standard for Route Implementation

### 1. The "Context-First" Rule
Every route handler must first initialize a **child logger** derived from `c.get('logger')`. This ensures all subsequent logs for that request are tagged with the relevant identifiers.
*   **Context Keys:** Always include `action` (the `operationId`).
*   **Identifiers:** Include `userId`, `produceId`, `orderId`, or `subscriptionId` as early as possible.

```typescript
// Example Pattern
const log = c.get('logger').child({ 
  action: 'updateOrder',
  orderId,
  userId 
});
```

### 2. Logging Levels & Triggers
Follow this hierarchy to prevent log bloat while maintaining security visibility:

*   **`log.info` (State Changes):** Use for successful mutations (POST/PUT/DELETE) and external service triggers (Stripe, Push Notifications). 
    *   *Tip:* Log the **reason** for a side effect (e.g., "Triggering refund because status changed to canceled").
*   **`log.warn` (Security/Validation):** Use for ownership check failures (e.g., "User A tried to edit User B's listing") or 404s that imply a potential unauthorized access attempt.
*   **`log.error` (System Failure):** Use inside `.catch()` blocks for un-awaited background promises (like batch operations) that don't block the HTTP response but need monitoring.

### 3. The "Anti-Noise" Pattern
*   **No Generic Messages:** Avoid `log.info('Function started')`. The `action` key in the child logger already provides this info.
*   **No PII:** Never log raw emails, physical addresses, or full names. Log the `id` instead.
*   **Metadata over Prose:** Prefer `log.info({ count: items.length }, 'Fetched list')` over `log.info('I have successfully fetched the list of items')`.

### 4. Service-Layer Integration
Pass the `log` instance from the Route to the Service. The Service should use it to log the "Why" behind business logic, especially when data integrity or money (Stripe) is involved.
