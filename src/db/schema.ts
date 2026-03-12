import { pgTable, serial, text, customType } from 'drizzle-orm/pg-core';

const geography = customType<{ data: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
});

export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  coordinates: geography('coordinates').notNull(),
});
