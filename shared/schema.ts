import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";
export * from "./models/chat";

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  patientId: integer("patient_id"), // Optional link to EMR patient record
  title: text("title").notNull(),
  patientName: text("patient_name"),
  specialty: text("specialty"),
  subjective: text("subjective"),
  objective: text("objective"),
  assessment: text("assessment"),
  plan: text("plan"),
  transcript: text("transcript"),
  patientContext: text("patient_context"), // Background info: history, medications, allergies
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
  hasEmrAccess: boolean("has_emr_access").default(false), // EMR feature access (granted via special invite)
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

export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  prompt: text("prompt").notNull(),
  isDefault: boolean("is_default").default(false),
  isPublic: boolean("is_public").default(false), // Allow sharing publicly
  sharedWith: text("shared_with").array(), // Array of user IDs template is shared with
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Invite codes for admin to grant memberships
export const invites = pgTable("invites", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  membershipType: text("membership_type").notNull(), // 'trial_7', 'trial_14', 'trial_30', 'months_1', 'months_3', 'months_6', 'months_12', 'lifetime'
  emailSentTo: text("email_sent_to"), // Email address the invite was sent to (if sent via email)
  usedBy: varchar("used_by"),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  expiresAt: timestamp("expires_at"), // Optional expiration for the invite code itself
});

export const insertInviteSchema = createInsertSchema(invites).omit({
  id: true,
  createdAt: true,
  usedBy: true,
  usedAt: true,
});

// User settings/preferences
export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  preferredName: text("preferred_name"), // Display name to show instead of email
  credentials: text("credentials"), // Professional credentials (e.g., "MD, FACP", "NP", "PA-C")
  specialty: text("specialty"), // Medical specialty (e.g., "Primary Care", "Cardiology")
  practiceName: text("practice_name"),
  language: text("language").default("en"), // Preferred language
  defaultTemplateId: integer("default_template_id"), // FK to templates
  noteStyle: text("note_style").default("detailed"), // 'detailed', 'concise', 'bullet_points'
  noteFontSize: text("note_font_size").default("medium"), // 'small', 'medium', 'large'
  sidebarCollapsed: boolean("sidebar_collapsed").default(false), // Remember sidebar state
  autoSaveEnabled: boolean("auto_save_enabled").default(true),
  showTimestamps: boolean("show_timestamps").default(true), // Show timestamps in transcript
  emailNotificationsEnabled: boolean("email_notifications_enabled").default(false), // Daily task digest
  emailDigestTime: text("email_digest_time").default("08:00"), // Time to send digest (HH:mm)
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Note = typeof notes.$inferSelect;
export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Invite = typeof invites.$inferSelect;
export type InsertInvite = z.infer<typeof insertInviteSchema>;
export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;

// Tasks for clinical follow-ups (referrals, refills, scheduling, etc.)
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  noteId: integer("note_id"), // Optional link to a note
  title: text("title").notNull(),
  patientName: text("patient_name"),
  category: text("category").notNull().default("document"), // 'document', 'order', 'coordinate', 'communicate'
  status: text("status").notNull().default("todo"), // 'todo', 'completed'
  dueDate: timestamp("due_date"), // Optional due date
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

// Practices/Teams for collaboration
export const practices = pgTable("practices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: varchar("owner_id").notNull(), // User who created the practice
  description: text("description"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPracticeSchema = createInsertSchema(practices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Practice = typeof practices.$inferSelect;
export type InsertPractice = z.infer<typeof insertPracticeSchema>;

// Practice members - links users to practices
export const practiceMembers = pgTable("practice_members", {
  id: serial("id").primaryKey(),
  practiceId: integer("practice_id").notNull(),
  userId: varchar("user_id").notNull(),
  role: text("role").notNull().default("member"), // 'owner', 'admin', 'member'
  invitedBy: varchar("invited_by"),
  joinedAt: timestamp("joined_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPracticeMemberSchema = createInsertSchema(practiceMembers).omit({
  id: true,
  joinedAt: true,
});

export type PracticeMember = typeof practiceMembers.$inferSelect;
export type InsertPracticeMember = z.infer<typeof insertPracticeMemberSchema>;

// Shared notes - tracks which notes are shared with which users/practices
export const sharedNotes = pgTable("shared_notes", {
  id: serial("id").primaryKey(),
  noteId: integer("note_id").notNull(),
  sharedBy: varchar("shared_by").notNull(), // User who shared
  sharedWithUserId: varchar("shared_with_user_id"), // Specific user
  sharedWithPracticeId: integer("shared_with_practice_id"), // Or shared with entire practice
  permission: text("permission").notNull().default("view"), // 'view', 'edit', 'comment'
  sharedAt: timestamp("shared_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertSharedNoteSchema = createInsertSchema(sharedNotes).omit({
  id: true,
  sharedAt: true,
});

export type SharedNote = typeof sharedNotes.$inferSelect;
export type InsertSharedNote = z.infer<typeof insertSharedNoteSchema>;

// ============ EMR TABLES ============

// Patients - core EMR patient records
export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), // Provider who owns this patient record
  // Demographics
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: timestamp("date_of_birth"),
  gender: text("gender"), // 'male', 'female', 'other', 'prefer_not_to_say'
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  // Insurance
  insuranceProvider: text("insurance_provider"),
  insurancePolicyNumber: text("insurance_policy_number"),
  // Medical Info
  medicalHistory: text("medical_history"), // JSON or text summary
  allergies: text("allergies"),
  medications: text("medications"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  // Status
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPatientSchema = createInsertSchema(patients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = z.infer<typeof insertPatientSchema>;

// Appointments - scheduling system
export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), // Provider
  patientId: integer("patient_id").notNull(), // Patient
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: text("status").notNull().default("scheduled"), // 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'
  appointmentType: text("appointment_type").default("general"), // 'general', 'follow_up', 'initial', 'urgent', 'telehealth'
  location: text("location"), // Office, telehealth link, etc.
  notes: text("notes"),
  reminderSent: boolean("reminder_sent").default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;

// Patient Documents - file storage for patient records
export const patientDocuments = pgTable("patient_documents", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), // Provider who uploaded
  patientId: integer("patient_id").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // MIME type
  fileSize: integer("file_size"), // In bytes
  fileUrl: text("file_url").notNull(), // Storage URL
  documentType: text("document_type").default("other"), // 'lab_result', 'imaging', 'referral', 'consent', 'insurance', 'other'
  description: text("description"),
  uploadedAt: timestamp("uploaded_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPatientDocumentSchema = createInsertSchema(patientDocuments).omit({
  id: true,
  uploadedAt: true,
});

export type PatientDocument = typeof patientDocuments.$inferSelect;
export type InsertPatientDocument = z.infer<typeof insertPatientDocumentSchema>;
