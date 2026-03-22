import type { ScheduleType } from '../db/types.js';
import { availabilityRepository } from '../repositories/availability.repository.js';
import { scheduleRuleRepository } from '../repositories/schedule-rule.repository.js';

/**
 * Fetch available pickup/delivery slots for a seller,
 * omitting times where they already have conflicting scheduled orders or are in the past.
 * @param sellerId - The unique identifier of the seller to check availability for.
 * @param dateStr - An ISO date string or date-only string (YYYY-MM-DD).
 * @param type - The fulfillment type (e.g., 'pickup' or 'delivery').
 * @returns A promise resolving to an array of ISO 8601 strings representing available 30-minute time slots.
 */
export async function getAvailability(
  sellerId: string,
  dateStr: string,
  type: ScheduleType,
): Promise<string[]> {
  const dateOnlyStr = dateStr.split('T')[0];
  if (!dateOnlyStr) return [];

  const dateObj = new Date(`${dateOnlyStr}T00:00:00Z`);
  if (isNaN(dateObj.getTime())) return [];

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const dayOfWeek = daysOfWeek[dateObj.getUTCDay()];

  if (!dayOfWeek) return [];

  const todayRules = await scheduleRuleRepository.getScheduleRules(sellerId, dayOfWeek, type);

  if (todayRules.length === 0) {
    return [];
  }

  const allSlots: Date[] = [];

  // Generate 30-minute incremental slots within the specified rule bounds
  for (const rule of todayRules) {
    if (!rule.startTime || !rule.endTime) continue;

    const [startH, startM] = rule.startTime.split(':').map(Number);
    const [endH, endM] = rule.endTime.split(':').map(Number);

    const start = new Date(`${dateOnlyStr}T00:00:00Z`);
    start.setUTCHours(startH ?? 0, startM ?? 0, 0, 0);

    const end = new Date(`${dateOnlyStr}T00:00:00Z`);
    end.setUTCHours(endH ?? 0, endM ?? 0, 0, 0);

    let current = new Date(start);
    while (current < end) {
      allSlots.push(new Date(current));
      current.setUTCMinutes(current.getUTCMinutes() + 30);
    }
  }

  // Deduplicate and sort all potential slots
  const uniqueSlots = Array.from(new Set(allSlots.map((s) => s.toISOString()))).sort();

  const startOfDay = new Date(`${dateOnlyStr}T00:00:00Z`);
  const endOfDay = new Date(`${dateOnlyStr}T23:59:59.999Z`);

  const existingOrders = await availabilityRepository.getActiveOrders(
    sellerId,
    startOfDay,
    endOfDay,
  );

  const bookedTimes = new Set(
    existingOrders.map((o) => {
      const d = o.scheduledTime instanceof Date ? o.scheduledTime : new Date(o.scheduledTime);
      return d.toISOString();
    }),
  );

  const now = new Date();

  // Return slots that haven't passed and don't match conflicting times
  return uniqueSlots.filter((slotIso) => {
    return !bookedTimes.has(slotIso) && new Date(slotIso) > now;
  });
}
