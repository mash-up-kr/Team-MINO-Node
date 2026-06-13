import dayjs from "dayjs";
import { serial, timestamp } from "drizzle-orm/pg-core";

export const id = serial("id").primaryKey();
export const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();
export const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdateFn(() => dayjs().toDate());
export const deletedAt = timestamp("deleted_at", { withTimezone: true });

export const baseColumns = { id, createdAt, updatedAt };
export const softDeleteColumns = { deletedAt };
