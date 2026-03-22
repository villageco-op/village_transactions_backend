import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { scheduleRuleRepository } from '../../../src/repositories/schedule-rule.repository.js';
import { users, scheduleRules } from '../../../src/db/schema.js';

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
      { dayOfWeek: 'Monday', startTime: '08:00', endTime: '12:00' },
      { dayOfWeek: 'Friday', startTime: '12:00', endTime: '16:00' },
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
    expect(sorted[1].dayOfWeek).toBe('Monday');
    expect(sorted[1].endTime).toBe('12:00:00');
  });

  it('should replace existing schedule rules entirely', async () => {
    await scheduleRuleRepository.replaceSellerRules(SELLER_ID, [
      { dayOfWeek: 'Tuesday', startTime: '09:00', endTime: '17:00' },
    ]);

    await scheduleRuleRepository.replaceSellerRules(SELLER_ID, [
      { dayOfWeek: 'Saturday', startTime: '10:00', endTime: '14:00' },
    ]);

    const activeRules = await testDb
      .select()
      .from(scheduleRules)
      .where(eq(scheduleRules.sellerId, SELLER_ID));

    expect(activeRules).toHaveLength(1);
    expect(activeRules[0].dayOfWeek).toBe('Saturday');
    expect(activeRules[0].startTime).toBe('10:00:00');
  });

  it('should clear all rules if an empty array is passed', async () => {
    await scheduleRuleRepository.replaceSellerRules(SELLER_ID, [
      { dayOfWeek: 'Sunday', startTime: '06:00', endTime: '12:00' },
    ]);

    await scheduleRuleRepository.replaceSellerRules(SELLER_ID, []);

    const activeRules = await testDb
      .select()
      .from(scheduleRules)
      .where(eq(scheduleRules.sellerId, SELLER_ID));

    expect(activeRules).toHaveLength(0);
  });
});
