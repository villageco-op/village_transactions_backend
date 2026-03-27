import { describe, it, expect } from 'vitest';
import { authedRequest } from '../../test-utils/auth.js';

describe('Produce API - Smoke Tests', () => {
  it('POST /api/produce should not return a 500 error', async () => {
    const res = await authedRequest('/api/produce', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Organic Honeycrisp Apples',
        produceType: 'fruit',
        pricePerOz: 0.25,
        totalOzInventory: 500,
        harvestFrequencyDays: 7,
        seasonStart: '2024-09-01',
        seasonEnd: '2024-11-30',
        images: ['https://example.com/apple.jpg'],
        isSubscribable: true,
      }),
    });

    expect(res.status).not.toBe(500);
  });
});
