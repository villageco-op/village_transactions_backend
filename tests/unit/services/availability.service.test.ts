import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { getAvailability } from '../../../src/services/availability.service.js';
import { availabilityRepository } from '../../../src/repositories/availability.repository.js';
import { scheduleRuleRepository } from '../../../src/repositories/schedule-rule.repository.js';

vi.mock('../../../src/repositories/availability.repository.js', () => ({
  availabilityRepository: {
    getActiveOrders: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/schedule-rule.repository.js', () => ({
  scheduleRuleRepository: {
    getScheduleRules: vi.fn(),
  },
}));

describe('AvailabilityService - getAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Lock the system time so "past" time filtering behaves predictably
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return empty if date is invalid', async () => {
    const slots = await getAvailability('seller_1', 'invalid-date', 'pickup');
    expect(slots).toEqual([]);
    expect(scheduleRuleRepository.getScheduleRules).not.toHaveBeenCalled();
  });

  it('should return empty if no schedule rules match the day and type', async () => {
    vi.mocked(scheduleRuleRepository.getScheduleRules).mockResolvedValueOnce([]);

    // 2030-01-04 is a Friday
    const slots = await getAvailability('seller_1', '2030-01-04', 'pickup');

    expect(slots).toEqual([]);
    expect(scheduleRuleRepository.getScheduleRules).toHaveBeenCalledWith(
      'seller_1',
      'Friday',
      'pickup',
    );
    expect(availabilityRepository.getActiveOrders).not.toHaveBeenCalled();
  });

  it('should generate 30-minute intervals and omit times that are already booked', async () => {
    vi.mocked(scheduleRuleRepository.getScheduleRules).mockResolvedValueOnce([
      { startTime: '09:00', endTime: '10:30' } as any,
    ]);

    // Order overlapping exactly on the 09:30 slot
    vi.mocked(availabilityRepository.getActiveOrders).mockResolvedValueOnce([
      { scheduledTime: new Date('2030-01-04T09:30:00Z') } as any,
    ]);

    const slots = await getAvailability('seller_1', '2030-01-04', 'pickup');

    expect(slots).toEqual([
      '2030-01-04T09:00:00.000Z',
      // 09:30 is missing because it's booked
      '2030-01-04T10:00:00.000Z',
    ]);

    expect(scheduleRuleRepository.getScheduleRules).toHaveBeenCalledWith(
      'seller_1',
      'Friday',
      'pickup',
    );
    expect(availabilityRepository.getActiveOrders).toHaveBeenCalled();
  });

  it('should filter out generated slots that are in the past', async () => {
    vi.mocked(scheduleRuleRepository.getScheduleRules).mockResolvedValueOnce([
      { startTime: '09:00', endTime: '17:00' } as any,
    ]);
    vi.mocked(availabilityRepository.getActiveOrders).mockResolvedValueOnce([]);

    const slots = await getAvailability('seller_1', '2029-12-31', 'delivery');

    expect(slots).toEqual([]);
  });

  it('should handle merging multiple schedule rules spanning contiguous or overlapping bounds', async () => {
    vi.mocked(scheduleRuleRepository.getScheduleRules).mockResolvedValueOnce([
      { startTime: '09:00', endTime: '10:00' } as any,
      { startTime: '09:30', endTime: '10:30' } as any,
    ]);

    vi.mocked(availabilityRepository.getActiveOrders).mockResolvedValueOnce([]);

    const slots = await getAvailability('seller_1', '2030-01-04', 'delivery');

    expect(slots).toEqual([
      '2030-01-04T09:00:00.000Z',
      '2030-01-04T09:30:00.000Z',
      '2030-01-04T10:00:00.000Z',
    ]);
  });
});
