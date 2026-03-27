# Code Standards

## Documentation

Documentation is enforced using:

```

eslint-plugin-jsdoc

```

---

## TSDoc Requirements

All public code must include:

- description
- params
- returns

Example:

```ts
/**
 * Returns the average of two numbers.
 *
 * @param x - first number
 * @param y - second number
 * @returns arithmetic mean
 */
function average(x: number, y: number): number {
  return (x + y) / 2;
}
```

---

## API Documentation

Style:

```
REST
OpenAPI
```

Framework:

```
@hono/zod-openapi
```

Benefits:

- Swagger documentation
- type-safe routes
- automatic API documentation

### Required

Every route must define:

```
operationId
```

This name is used by generated frontend clients.
