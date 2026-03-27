import { describe, it, expect } from 'vitest';
import { request } from '../test-utils/request.js';

describe('API Documentation', () => {
  it('GET /doc should return valid OpenAPI spec', async () => {
    const res = await request('/doc');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/json/);

    const spec = await res.json();

    expect(spec).toHaveProperty('openapi', '3.0.0');
    expect(spec.info.title).toBe('Marketplace API');

    expect(spec.paths).toHaveProperty('/api/users/me');
    expect(spec.paths).toHaveProperty('/api/availability/{sellerId}');
  });

  it('GET /ui should return Swagger UI HTML', async () => {
    const res = await request('/ui');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);

    const html = await res.text();
    expect(html).toContain('SwaggerUI');
  });
});
