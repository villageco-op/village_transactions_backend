import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { subscriptionRepository } from '../../../src/repositories/subscription.repository.js';
import { users, produce, subscriptions } from '../../../src/db/schema.js';
import { eq } from 'drizzle-orm';

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

  describe('querySubscriptions', () => {
    const buyer1Id = 'buyer_q_1';
    const buyer2Id = 'buyer_q_2';
    const seller1Id = 'seller_q_1';
    let product1: any;
    let product2: any;

    beforeEach(async () => {
      await testDb.insert(users).values([
        { id: buyer1Id, email: 'bq1@test.com' },
        { id: buyer2Id, email: 'bq2@test.com' },
        { id: seller1Id, email: 'sq1@test.com' },
      ]);

      const products = await testDb
        .insert(produce)
        .values([
          {
            sellerId: seller1Id,
            title: 'Prod 1',
            pricePerOz: '1.00',
            totalOzInventory: '10',
            harvestFrequencyDays: 7,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
          {
            sellerId: seller1Id,
            title: 'Prod 2',
            pricePerOz: '2.00',
            totalOzInventory: '20',
            harvestFrequencyDays: 7,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
        ])
        .returning();

      product1 = products[0];
      product2 = products[1];

      await testDb.insert(subscriptions).values([
        {
          buyerId: buyer1Id,
          productId: product1.id,
          quantityOz: '5',
          status: 'active',
          fulfillmentType: 'pickup',
        },
        {
          buyerId: buyer1Id,
          productId: product2.id,
          quantityOz: '10',
          status: 'paused',
          fulfillmentType: 'pickup',
        },
        {
          buyerId: buyer2Id,
          productId: product1.id,
          quantityOz: '15',
          status: 'active',
          fulfillmentType: 'pickup',
        },
      ]);
    });

    it('should filter explicitly by buyer ID and join user data', async () => {
      const result = await subscriptionRepository.querySubscriptions(
        buyer1Id,
        { buyerId: buyer1Id, page: 1, limit: 10 },
        0,
      );

      expect(result.total).toBe(2);
      expect(result.activeCount).toBe(1);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].buyer?.id).toBe(buyer1Id);
    });

    it('should filter by subscription status and respect seller context', async () => {
      const result = await subscriptionRepository.querySubscriptions(
        seller1Id,
        { status: 'paused', page: 1, limit: 10 },
        0,
      );

      expect(result.total).toBe(1);
      expect(result.activeCount).toBe(2);
      expect(result.data[0].subscription.status).toBe('paused');
      expect(result.data[0].subscription.productId).toBe(product2.id);
    });

    it('should correctly paginate results using limit and offset', async () => {
      const page1 = await subscriptionRepository.querySubscriptions(
        seller1Id,
        { sellerId: seller1Id, page: 1, limit: 2 },
        0,
      );
      expect(page1.total).toBe(3);
      expect(page1.activeCount).toBe(2);
      expect(page1.data).toHaveLength(2);

      const page2 = await subscriptionRepository.querySubscriptions(
        seller1Id,
        { sellerId: seller1Id, page: 2, limit: 2 },
        2,
      );
      expect(page2.activeCount).toBe(2);
      expect(page2.data).toHaveLength(1);
    });

    it('should restrict results to the requesting user’s scope for security', async () => {
      // Even without a buyerId filter, the requestingUserId (buyer2Id) should restrict the result
      const result = await subscriptionRepository.querySubscriptions(
        buyer2Id,
        { page: 1, limit: 10 },
        0,
      );

      expect(result.total).toBe(1);
      expect(result.activeCount).toBe(1);
      expect(result.data[0].subscription.buyerId).toBe(buyer2Id);
      expect(result.data.every((row) => row.subscription.buyerId === buyer2Id)).toBe(true);
    });
  });

  describe('updateSubscriptionData', () => {
    it('should update all provided fields and the updatedAt timestamp', async () => {
      vi.useFakeTimers();
      const initialDate = new Date('2024-01-01T10:00:00Z');
      vi.setSystemTime(initialDate);

      const sellerId = 'seller_1';
      const buyerId = 'buyer_1';

      await testDb.insert(users).values([
        { id: sellerId, email: 's@test.com' },
        { id: buyerId, email: 'b@test.com' },
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
          quantityOz: '5.00',
          status: 'active',
          fulfillmentType: 'pickup',
        })
        .returning();

      const newDate = new Date('2024-01-02T10:00:00Z');
      vi.setSystemTime(newDate);

      const updated = await subscriptionRepository.updateSubscriptionData(subscription.id, {
        status: 'paused',
        quantityOz: 15.5,
        fulfillmentType: 'delivery',
        cancelReason: 'Going on vacation',
      });

      expect(updated.status).toBe('paused');
      expect(updated.quantityOz).toBe('15.50'); // DB stores as numeric string
      expect(updated.fulfillmentType).toBe('delivery');
      expect(updated.cancelReason).toBe('Going on vacation');
      expect(updated.updatedAt?.toISOString()).toBe(newDate.toISOString());

      vi.useRealTimers();
    });

    it('should perform a partial update without affecting other fields', async () => {
      const buyerId = 'buyer_partial_test';
      const sellerId = 'seller_partial_test';

      await testDb.insert(users).values([
        { id: sellerId, email: 's2@test.com' },
        { id: buyerId, email: 'b2@test.com' },
      ]);

      const [product] = await testDb
        .insert(produce)
        .values({
          sellerId,
          title: 'Oranges',
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

      await subscriptionRepository.updateSubscriptionData(subscription.id, {
        quantityOz: 20,
      });

      const [retrieved] = await testDb
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscription.id));
      expect(retrieved.quantityOz).toBe('20.00');
      expect(retrieved.status).toBe('active');
    });
  });

  describe('updateSubscriptionDataByStripeId', () => {
    it('should update a subscription using the Stripe Subscription ID', async () => {
      const stripeId = 'sub_12345';
      const buyerId = 'buyer_stripe_test';
      const sellerId = 'seller_stripe_test';

      await testDb.insert(users).values([
        { id: sellerId, email: 's3@test.com' },
        { id: buyerId, email: 'b3@test.com' },
      ]);

      const [product] = await testDb
        .insert(produce)
        .values({
          sellerId,
          title: 'Grapes',
          pricePerOz: '1.00',
          totalOzInventory: '100',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        })
        .returning();

      await testDb.insert(subscriptions).values({
        buyerId,
        productId: product.id,
        stripeSubscriptionId: stripeId,
        quantityOz: '10.00',
        status: 'active',
        fulfillmentType: 'pickup',
      });

      const updated = await subscriptionRepository.updateSubscriptionDataByStripeId(stripeId, {
        status: 'canceled',
        cancelReason: 'Payment failed',
      });

      expect(updated.stripeSubscriptionId).toBe(stripeId);
      expect(updated.status).toBe('canceled');
      expect(updated.cancelReason).toBe('Payment failed');
    });
  });

  describe('getSubscriptionsByProduct', () => {
    it('should return only subscriptions matching the productId and provided statuses', async () => {
      const sellerId = 'seller_multi_test';

      await testDb.insert(users).values([
        { id: 'seller_multi_test', email: 's4@test.com' },
        { id: 'b1', email: 'b1@test.com' },
        { id: 'b2', email: 'b2@test.com' },
        { id: 'b3', email: 'b3@test.com' },
        { id: 'b4', email: 'b4@test.com' },
      ]);

      const [productA] = await testDb
        .insert(produce)
        .values({
          sellerId,
          title: 'Product A',
          pricePerOz: '1.00',
          totalOzInventory: '100',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        })
        .returning();

      const [productB] = await testDb
        .insert(produce)
        .values({
          sellerId,
          title: 'Product B',
          pricePerOz: '1.00',
          totalOzInventory: '100',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        })
        .returning();

      await testDb.insert(subscriptions).values([
        {
          buyerId: 'b1',
          productId: productA.id,
          status: 'active',
          quantityOz: '1',
          fulfillmentType: 'pickup',
        },
        {
          buyerId: 'b2',
          productId: productA.id,
          status: 'paused',
          quantityOz: '1',
          fulfillmentType: 'pickup',
        },
        {
          buyerId: 'b3',
          productId: productA.id,
          status: 'canceled',
          quantityOz: '1',
          fulfillmentType: 'pickup',
        },
        {
          buyerId: 'b4',
          productId: productB.id,
          status: 'active',
          quantityOz: '1',
          fulfillmentType: 'pickup',
        },
      ]);

      const results = await subscriptionRepository.getSubscriptionsByProduct(productA.id, [
        'active',
        'paused',
      ]);

      expect(results).toHaveLength(2);
      expect(results.every((s) => s.productId === productA.id)).toBe(true);

      const statuses = results.map((s) => s.status);
      expect(['active', 'paused']).toEqual(expect.arrayContaining(statuses));
    });

    it('should return an empty array if no subscriptions match the criteria', async () => {
      const results = await subscriptionRepository.getSubscriptionsByProduct(crypto.randomUUID(), [
        'active',
      ]);
      expect(results).toEqual([]);
    });
  });
});
