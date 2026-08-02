import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sharedGrades = sqliteTable("shared_grades", {
  code: text("code", { length: 5 }).primaryKey(),
  fingerprint: text("fingerprint").notNull().unique(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
