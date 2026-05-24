import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { scheduleRuleRepository } from '../../../src/repositories/schedule-rule.repository.js';
import { users, scheduleRules } from '../../../src/db/schema.js';
import type { ScheduleType } from '../../../src/db/types.js';

describe('ScheduleRuleRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const SELLER_ID = 'test_seller_rules_123';

  beforeAll(() => {
    testDb = getTestDb();
    scheduleRuleRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values({
      id: SELLER_ID,
      name: 'Seller User',
      email: 'seller.rules@example.com',
    });
  });

  it('should insert new schedule rules for a seller', async () => {
    const rules = [
      { dayOfWeek: 'Monday', startTime: '08:00', endTime: '12:00', type: 'pickup' as ScheduleType },
      {
        dayOfWeek: 'Friday',
        startTime: '12:00',
        endTime: '16:00',
        type: 'delivery' as ScheduleType,
      },
    ];

    await scheduleRuleRepository.replaceSellerRules(SELLER_ID, rules);

    const insertedRules = await testDb
      .select()
      .from(scheduleRules)
      .where(eq(scheduleRules.sellerId, SELLER_ID));

    expect(insertedRules).toHaveLength(2);
    const sorted = insertedRules.sort((a: { dayOfWeek: string }, b: { dayOfWeek: string }) =>
      a.dayOfWeek.localeCompare(b.dayOfWeek),
    );
    expect(sorted[0].dayOfWeek).toBe('Friday');
    expect(sorted[0].startTime).toBe('12:00:00');
    expect(sorted[0].type).toBe('delivery');
    expect(sorted[1].dayOfWeek).toBe('Monday');
    expect(sorted[1].endTime).toBe('12:00:00');
    expect(sorted[1].type).toBe('pickup');
  });

  it('should replace existing schedule rules entirely', async () => {
    await scheduleRuleRepository.replaceSellerRules(SELLER_ID, [
      {
        dayOfWeek: 'Tuesday',
        startTime: '09:00',
        endTime: '17:00',
        type: 'pickup' as ScheduleType,
      },
    ]);

    await scheduleRuleRepository.replaceSellerRules(SELLER_ID, [
      {
        dayOfWeek: 'Saturday',
        startTime: '10:00',
        endTime: '14:00',
        type: 'delivery' as ScheduleType,
      },
    ]);

    const activeRules = await testDb
      .select()
      .from(scheduleRules)
      .where(eq(scheduleRules.sellerId, SELLER_ID));

    expect(activeRules).toHaveLength(1);
    expect(activeRules[0].dayOfWeek).toBe('Saturday');
    expect(activeRules[0].startTime).toBe('10:00:00');
    expect(activeRules[0].type).toBe('delivery');
  });

  it('should clear all rules if an empty array is passed', async () => {
    await scheduleRuleRepository.replaceSellerRules(SELLER_ID, [
      { dayOfWeek: 'Sunday', startTime: '06:00', endTime: '12:00', type: 'pickup' as ScheduleType },
    ]);

    await scheduleRuleRepository.replaceSellerRules(SELLER_ID, []);

    const activeRules = await testDb
      .select()
      .from(scheduleRules)
      .where(eq(scheduleRules.sellerId, SELLER_ID));

    expect(activeRules).toHaveLength(0);
  });

  describe('getScheduleRules', () => {
    it('should return rules only for the requested dayOfWeek and type', async () => {
      await testDb.insert(scheduleRules).values([
        {
          sellerId: SELLER_ID,
          dayOfWeek: 'Monday',
          type: 'pickup',
          startTime: '08:00',
          endTime: '12:00',
        },
        {
          sellerId: SELLER_ID,
          dayOfWeek: 'Monday',
          type: 'delivery',
          startTime: '13:00',
          endTime: '17:00',
        },
        {
          sellerId: SELLER_ID,
          dayOfWeek: 'Tuesday',
          type: 'pickup',
          startTime: '09:00',
          endTime: '10:00',
        },
      ]);

      const pickupRules = await scheduleRuleRepository.getScheduleRules(
        SELLER_ID,
        'Monday',
        'pickup',
      );

      expect(pickupRules).toHaveLength(1);
      expect(pickupRules[0].startTime).toBe('08:00:00');
      expect(pickupRules[0].type).toBe('pickup');

      const deliveryRules = await scheduleRuleRepository.getScheduleRules(
        SELLER_ID,
        'Monday',
        'delivery',
      );

      expect(deliveryRules).toHaveLength(1);
      expect(deliveryRules[0].startTime).toBe('13:00:00');
      expect(deliveryRules[0].type).toBe('delivery');
    });
  });

  describe('deleteBySellerId', () => {
    it('should delete all schedule rules for the specified seller and keep other sellers intact', async () => {
      const OTHER_SELLER_ID = 'other_seller_456';

      await testDb.insert(users).values({
        id: OTHER_SELLER_ID,
        name: 'Other Seller',
        email: 'other.rules@example.com',
      });

      await testDb.insert(scheduleRules).values([
        {
          sellerId: SELLER_ID,
          dayOfWeek: 'Monday',
          type: 'pickup',
          startTime: '08:00',
          endTime: '12:00',
        },
        {
          sellerId: SELLER_ID,
          dayOfWeek: 'Tuesday',
          type: 'delivery',
          startTime: '13:00',
          endTime: '17:00',
        },
        {
          sellerId: OTHER_SELLER_ID,
          dayOfWeek: 'Wednesday',
          type: 'pickup',
          startTime: '10:00',
          endTime: '14:00',
        },
      ]);

      await scheduleRuleRepository.deleteBySellerId(SELLER_ID);

      const targetSellerRules = await testDb
        .select()
        .from(scheduleRules)
        .where(eq(scheduleRules.sellerId, SELLER_ID));

      expect(targetSellerRules).toHaveLength(0);

      const otherSellerRules = await testDb
        .select()
        .from(scheduleRules)
        .where(eq(scheduleRules.sellerId, OTHER_SELLER_ID));

      expect(otherSellerRules).toHaveLength(1);
      expect(otherSellerRules[0].dayOfWeek).toBe('Wednesday');
    });

    it('should run successfully and not throw an error if the seller has no rules to delete', async () => {
      await expect(
        scheduleRuleRepository.deleteBySellerId('non_existent_seller'),
      ).resolves.not.toThrow();
    });
  });
});
