import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";
export * from "./models/chat";

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  patientName: text("patient_name"),
  specialty: text("specialty"),
  subjective: text("subjective"),
  objective: text("objective"),
  assessment: text("assessment"),
  plan: text("plan"),
  transcript: text("transcript"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").default("inactive"),
  currentPeriodEnd: timestamp("current_period_end"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertNoteSchema = createInsertSchema(notes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Note = typeof notes.$inferSelect;
export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
