import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { subscriptionRepository } from '../../../src/repositories/subscription.repository.js';
import { users, produce, subscriptions } from '../../../src/db/schema.js';

describe('SubscriptionRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;

  beforeAll(() => {
    testDb = getTestDb();
    subscriptionRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);
  });

  describe('getBuyerSubscription', () => {
    it('should successfully retrieve a subscription by ID for the correct buyer', async () => {
      const sellerId = 'seller_1';
      const buyerId = 'buyer_1';

      await testDb.insert(users).values([
        { id: sellerId, name: 'Seller', email: 'seller@test.com' },
        { id: buyerId, name: 'Buyer', email: 'buyer@test.com' },
      ]);

      const [product] = await testDb
        .insert(produce)
        .values({
          sellerId,
          title: 'Apples',
          pricePerOz: '1.00',
          totalOzInventory: '100',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        })
        .returning();

      const [subscription] = await testDb
        .insert(subscriptions)
        .values({
          buyerId,
          productId: product.id,
          quantityOz: '10.00',
          status: 'active',
          fulfillmentType: 'pickup',
        })
        .returning();

      const result = await subscriptionRepository.getBuyerSubscription(buyerId, subscription.id);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(subscription.id);
      expect(result?.buyerId).toBe(buyerId);
      expect(result?.quantityOz).toBe('10.00');
    });

    it('should return null if the subscription belongs to a different buyer', async () => {
      const sellerId = 'seller_1';
      const buyerId = 'buyer_1';
      const differentBuyerId = 'buyer_2';

      await testDb.insert(users).values([
        { id: sellerId, email: 'seller@test.com' },
        { id: buyerId, email: 'buyer@test.com' },
        { id: differentBuyerId, email: 'buyer2@test.com' },
      ]);

      const [product] = await testDb
        .insert(produce)
        .values({
          sellerId,
          title: 'Apples',
          pricePerOz: '1.00',
          totalOzInventory: '100',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        })
        .returning();

      const [subscription] = await testDb
        .insert(subscriptions)
        .values({
          buyerId,
          productId: product.id,
          quantityOz: '10.00',
          fulfillmentType: 'pickup',
        })
        .returning();

      const result = await subscriptionRepository.getBuyerSubscription(
        differentBuyerId,
        subscription.id,
      );

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should correctly update the status and updatedAt timestamp of a subscription', async () => {
      vi.useFakeTimers();
      const initialDate = new Date('2024-01-01T10:00:00Z');
      vi.setSystemTime(initialDate);

      const sellerId = 'seller_1';
      const buyerId = 'buyer_1';

      await testDb.insert(users).values([
        { id: sellerId, email: 'seller@test.com' },
        { id: buyerId, email: 'buyer@test.com' },
      ]);

      const [product] = await testDb
        .insert(produce)
        .values({
          sellerId,
          title: 'Apples',
          pricePerOz: '1.00',
          totalOzInventory: '100',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        })
        .returning();

      const [subscription] = await testDb
        .insert(subscriptions)
        .values({
          buyerId,
          productId: product.id,
          quantityOz: '10.00',
          status: 'active',
          fulfillmentType: 'pickup',
          createdAt: initialDate,
          updatedAt: initialDate,
        })
        .returning();

      // Move time forward
      const newDate = new Date('2024-01-02T10:00:00Z');
      vi.setSystemTime(newDate);

      const updated = await subscriptionRepository.updateStatus(subscription.id, 'paused');

      expect(updated.id).toBe(subscription.id);
      expect(updated.status).toBe('paused');
      expect(updated.updatedAt?.toISOString()).toBe(newDate.toISOString());

      vi.useRealTimers();
    });
  });

  describe('getActiveSubscriptionsForBuyer', () => {
    it('should return only active subscriptions with produce details for a specific buyer', async () => {
      const sellerId = 'seller_1';
      const buyer1Id = 'buyer_1';
      const buyer2Id = 'buyer_2';

      await testDb.insert(users).values([
        { id: sellerId, email: 'seller@test.com' },
        { id: buyer1Id, email: 'buyer1@test.com' },
        { id: buyer2Id, email: 'buyer2@test.com' },
      ]);

      const [product1, product2] = await testDb
        .insert(produce)
        .values([
          {
            sellerId,
            title: 'Carrots',
            pricePerOz: '0.50',
            totalOzInventory: '100',
            harvestFrequencyDays: 7,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
          {
            sellerId,
            title: 'Potatoes',
            pricePerOz: '0.30',
            totalOzInventory: '100',
            harvestFrequencyDays: 7,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
        ])
        .returning();

      await testDb.insert(subscriptions).values([
        {
          buyerId: buyer1Id,
          productId: product1.id,
          quantityOz: '10.00',
          status: 'active',
          fulfillmentType: 'pickup',
        },
        {
          buyerId: buyer1Id,
          productId: product2.id,
          quantityOz: '5.00',
          status: 'paused',
          fulfillmentType: 'pickup',
        }, // Paused, should be excluded
        {
          buyerId: buyer2Id,
          productId: product1.id,
          quantityOz: '15.00',
          status: 'active',
          fulfillmentType: 'pickup',
        }, // Wrong buyer, should be excluded
      ]);

      const results = await subscriptionRepository.getActiveSubscriptionsForBuyer(buyer1Id);

      expect(results).toHaveLength(1);
      expect(results[0].produceName).toBe('Carrots');
      expect(results[0].amount).toBe('10.00');
    });
  });

  describe('getActiveSubscriptionsForProducts', () => {
    it('should return active subscriptions for the given product IDs', async () => {
      const sellerId = 'seller_1';
      const buyerId = 'buyer_1';

      await testDb.insert(users).values([
        { id: sellerId, email: 'seller@test.com' },
        { id: buyerId, email: 'buyer1@test.com' },
      ]);

      const [product1, product2, product3] = await testDb
        .insert(produce)
        .values([
          {
            sellerId,
            title: 'Item 1',
            pricePerOz: '1.00',
            totalOzInventory: '100',
            harvestFrequencyDays: 7,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
          {
            sellerId,
            title: 'Item 2',
            pricePerOz: '1.00',
            totalOzInventory: '100',
            harvestFrequencyDays: 7,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
          {
            sellerId,
            title: 'Item 3',
            pricePerOz: '1.00',
            totalOzInventory: '100',
            harvestFrequencyDays: 7,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
        ])
        .returning();

      await testDb.insert(subscriptions).values([
        {
          buyerId,
          productId: product1.id,
          quantityOz: '10.00',
          status: 'active',
          fulfillmentType: 'pickup',
          nextDeliveryDate: new Date('2024-05-10T12:00:00Z'),
        },
        {
          buyerId,
          productId: product1.id,
          quantityOz: '5.00',
          status: 'paused',
          fulfillmentType: 'pickup',
        }, // Paused, should be ignored
        {
          buyerId,
          productId: product2.id,
          quantityOz: '15.00',
          status: 'active',
          fulfillmentType: 'pickup',
          nextDeliveryDate: new Date('2024-05-15T12:00:00Z'),
        },
        {
          buyerId,
          productId: product3.id,
          quantityOz: '20.00',
          status: 'active',
          fulfillmentType: 'pickup',
        }, // Unqueried product, should be ignored
      ]);

      // Querying for product 1 and 2
      const results = await subscriptionRepository.getActiveSubscriptionsForProducts([
        product1.id,
        product2.id,
      ]);

      expect(results).toHaveLength(2);

      const p1Sub = results.find((r) => r.productId === product1.id);
      expect(p1Sub).toBeDefined();
      expect(p1Sub?.quantityOz).toBe('10.00');
      expect(p1Sub?.nextDeliveryDate?.toISOString()).toBe(
        new Date('2024-05-10T12:00:00Z').toISOString(),
      );

      const p2Sub = results.find((r) => r.productId === product2.id);
      expect(p2Sub).toBeDefined();
      expect(p2Sub?.quantityOz).toBe('15.00');
    });

    it('should return an empty array if an empty product list is provided', async () => {
      const results = await subscriptionRepository.getActiveSubscriptionsForProducts([]);
      expect(results).toEqual([]);
    });

    it('should return an empty array if no active subscriptions match the provided products', async () => {
      const results = await subscriptionRepository.getActiveSubscriptionsForProducts([
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      ]);
      expect(results).toEqual([]);
    });
  });

  describe('getSubscriptionDetailsById', () => {
    it('should return combined subscription and produce details including sellerId', async () => {
      const sellerId = 'seller_get_test';
      const buyerId = 'buyer_get_test';

      await testDb.insert(users).values([
        { id: sellerId, name: 'Seller', email: 'seller@test.com' },
        { id: buyerId, name: 'Buyer', email: 'buyer@test.com' },
      ]);

      const [product] = await testDb
        .insert(produce)
        .values({
          sellerId,
          title: 'Fresh Berries',
          pricePerOz: '2.50',
          totalOzInventory: '50',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        })
        .returning();

      const [subscription] = await testDb
        .insert(subscriptions)
        .values({
          buyerId,
          productId: product.id,
          quantityOz: '10.00',
          status: 'active',
          fulfillmentType: 'delivery',
        })
        .returning();

      const result = await subscriptionRepository.getSubscriptionDetailsById(subscription.id);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(subscription.id);
      expect(result?.buyerId).toBe(buyerId);
      expect(result?.sellerId).toBe(sellerId);
      expect(result?.product).toBeDefined();
      expect(result?.product?.title).toBe('Fresh Berries');
    });

    it('should return null if the subscription ID does not exist', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const result = await subscriptionRepository.getSubscriptionDetailsById(fakeUuid);

      expect(result).toBeNull();
    });
  });
});
