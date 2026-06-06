import dayjs from "dayjs";
import { serial, timestamp } from "drizzle-orm/pg-core";

export const baseColumns = {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => dayjs().toDate()),
};

export const softDeleteColumns = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};
