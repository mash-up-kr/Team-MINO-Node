import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { serial, timestamp } from "drizzle-orm/pg-core";

dayjs.extend(utc);
dayjs.extend(timezone);

export const baseColumns = {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => dayjs().tz("Asia/Seoul").toDate()),
  deletedAt: timestamp("deleted_at"),
};
