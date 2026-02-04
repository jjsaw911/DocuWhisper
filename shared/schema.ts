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
  templateId: integer("template_id"), // Template used for SOAP generation
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
  // EMR Professional Credentials
  emrRole: text("emr_role"), // 'physician', 'mid_level', 'ma', 'front_desk', 'office_manager', 'billing', 'admin'
  licenseNumber: text("license_number"), // State medical license number
  licenseState: text("license_state"), // State where licensed
  licenseExpiry: timestamp("license_expiry"), // License expiration date
  npiNumber: text("npi_number"), // National Provider Identifier (10 digits)
  deaNumber: text("dea_number"), // DEA number for prescribing controlled substances
  deaExpiry: timestamp("dea_expiry"), // DEA expiration date
  supervisingPhysicianId: varchar("supervising_physician_id"), // For mid-levels: ID of supervising MD/DO
  requiresCosignature: boolean("requires_cosignature").default(false), // Whether encounters need physician co-sign
  language: text("language").default("en"), // Preferred language
  defaultTemplateId: integer("default_template_id"), // FK to templates
  noteStyle: text("note_style").default("detailed"), // 'detailed', 'concise', 'bullet_points'
  noteFontSize: text("note_font_size").default("medium"), // 'small', 'medium', 'large'
  sidebarCollapsed: boolean("sidebar_collapsed").default(false), // Remember sidebar state
  autoSaveEnabled: boolean("auto_save_enabled").default(true),
  showTimestamps: boolean("show_timestamps").default(true), // Show timestamps in transcript
  emailNotificationsEnabled: boolean("email_notifications_enabled").default(false), // Daily task digest
  emailDigestTime: text("email_digest_time").default("08:00"), // Time to send digest (HH:mm)
  // Security and compliance settings
  emrConsentAcknowledged: boolean("emr_consent_acknowledged").default(false), // HIPAA consent for EMR access
  emrConsentDate: timestamp("emr_consent_date"), // When consent was given
  sessionTimeoutMinutes: integer("session_timeout_minutes").default(30), // Session timeout (default 30 min)
  requireReauthForPhi: boolean("require_reauth_for_phi").default(false), // Require re-auth for sensitive PHI actions
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

// EMR Role definitions and permissions
export const EMR_ROLES = {
  physician: {
    label: "Physician (MD/DO)",
    canViewPatients: true,
    canEditPatients: true,
    canCreateEncounters: true,
    canSignEncounters: true,
    canCosignEncounters: true,
    canPrescribe: true,
    canViewSchedule: true,
    canEditSchedule: true,
    canViewBilling: true,
    canManageTeam: false,
    requiresCosignature: false,
  },
  mid_level: {
    label: "Mid-Level Provider (NP/PA)",
    canViewPatients: true,
    canEditPatients: true,
    canCreateEncounters: true,
    canSignEncounters: true,
    canCosignEncounters: false,
    canPrescribe: true, // With supervision
    canViewSchedule: true,
    canEditSchedule: true,
    canViewBilling: true,
    canManageTeam: false,
    requiresCosignature: true, // Encounters need physician co-sign
  },
  ma: {
    label: "Medical Assistant",
    canViewPatients: true,
    canEditPatients: true, // Demographics, vitals
    canCreateEncounters: false,
    canSignEncounters: false,
    canCosignEncounters: false,
    canPrescribe: false,
    canViewSchedule: true,
    canEditSchedule: true,
    canViewBilling: false,
    canManageTeam: false,
    requiresCosignature: false,
  },
  front_desk: {
    label: "Front Desk",
    canViewPatients: true, // Limited to demographics
    canEditPatients: true, // Demographics only
    canCreateEncounters: false,
    canSignEncounters: false,
    canCosignEncounters: false,
    canPrescribe: false,
    canViewSchedule: true,
    canEditSchedule: true,
    canViewBilling: false,
    canManageTeam: false,
    requiresCosignature: false,
  },
  office_manager: {
    label: "Office Manager",
    canViewPatients: true,
    canEditPatients: true,
    canCreateEncounters: false,
    canSignEncounters: false,
    canCosignEncounters: false,
    canPrescribe: false,
    canViewSchedule: true,
    canEditSchedule: true,
    canViewBilling: true,
    canManageTeam: true,
    requiresCosignature: false,
  },
  billing: {
    label: "Billing Staff",
    canViewPatients: true, // Limited to billing info
    canEditPatients: false,
    canCreateEncounters: false,
    canSignEncounters: false,
    canCosignEncounters: false,
    canPrescribe: false,
    canViewSchedule: true,
    canEditSchedule: false,
    canViewBilling: true,
    canManageTeam: false,
    requiresCosignature: false,
  },
  admin: {
    label: "Administrator",
    canViewPatients: true,
    canEditPatients: true,
    canCreateEncounters: false,
    canSignEncounters: false,
    canCosignEncounters: false,
    canPrescribe: false,
    canViewSchedule: true,
    canEditSchedule: true,
    canViewBilling: true,
    canManageTeam: true,
    requiresCosignature: false,
  },
} as const;

export type EmrRoleType = keyof typeof EMR_ROLES;

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

// Practices/Teams for collaboration (also serves as EMR Organizations)
export const practices = pgTable("practices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: varchar("owner_id").notNull(), // User who created the practice
  description: text("description"),
  // EMR Organization Settings
  hasEmrLicense: boolean("has_emr_license").default(false), // Organization has paid EMR access
  emrLicenseType: text("emr_license_type"), // 'trial', 'monthly', 'annual', 'lifetime'
  emrLicenseExpiry: timestamp("emr_license_expiry"), // When license expires
  emrMaxUsers: integer("emr_max_users").default(5), // Max users allowed under this license
  emrActiveUsers: integer("emr_active_users").default(0), // Current number of EMR users
  // Stripe for organization billing
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
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
  // EMR-specific permissions for this organization
  hasEmrAccess: boolean("has_emr_access").default(false), // User has EMR access within this org
  emrRole: text("emr_role"), // 'emr_admin', 'provider', 'staff', 'readonly' - org-level EMR role
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
  userId: varchar("user_id").notNull(), // Provider who created this patient record
  organizationId: integer("organization_id"), // Practice/org this patient belongs to (null = individual provider)
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

// Vitals - track patient vital signs over time
export const patientVitals = pgTable("patient_vitals", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull(),
  organizationId: integer("organization_id"),
  recordedBy: varchar("recorded_by").notNull(), // Provider who recorded
  recordedAt: timestamp("recorded_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  // Core vitals
  bloodPressureSystolic: integer("blood_pressure_systolic"), // mmHg
  bloodPressureDiastolic: integer("blood_pressure_diastolic"), // mmHg
  heartRate: integer("heart_rate"), // bpm
  respiratoryRate: integer("respiratory_rate"), // breaths/min
  temperature: text("temperature"), // Store as text to handle decimal (e.g., "98.6")
  temperatureUnit: text("temperature_unit").default("F"), // 'F' or 'C'
  oxygenSaturation: integer("oxygen_saturation"), // SpO2 %
  // Measurements
  weight: text("weight"), // Store as text for decimal precision
  weightUnit: text("weight_unit").default("lbs"), // 'lbs' or 'kg'
  height: text("height"), // Store as text (e.g., "5'10" or "178 cm")
  heightUnit: text("height_unit").default("in"), // 'in' or 'cm'
  bmi: text("bmi"), // Calculated BMI
  // Pain & Additional
  painLevel: integer("pain_level"), // 0-10 scale
  painLocation: text("pain_location"),
  bloodGlucose: integer("blood_glucose"), // mg/dL
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPatientVitalsSchema = createInsertSchema(patientVitals).omit({
  id: true,
  createdAt: true,
});

export type PatientVitals = typeof patientVitals.$inferSelect;
export type InsertPatientVitals = z.infer<typeof insertPatientVitalsSchema>;

// Encounters - clinical encounters/visits with HPI, ROS, Physical Exam
export const patientEncounters = pgTable("patient_encounters", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull(),
  organizationId: integer("organization_id"),
  providerId: varchar("provider_id").notNull(),
  appointmentId: integer("appointment_id"), // Link to appointment if applicable
  noteId: integer("note_id"), // Link to SOAP note if created
  encounterDate: timestamp("encounter_date").default(sql`CURRENT_TIMESTAMP`).notNull(),
  encounterType: text("encounter_type").default("office_visit"), // 'office_visit', 'telehealth', 'phone', 'follow_up', 'urgent'
  // Chief Complaint & HPI
  chiefComplaint: text("chief_complaint"),
  hpiOnset: text("hpi_onset"), // When symptoms started
  hpiLocation: text("hpi_location"), // Where
  hpiDuration: text("hpi_duration"), // How long
  hpiCharacter: text("hpi_character"), // Quality/character of symptoms
  hpiAggravating: text("hpi_aggravating"), // What makes it worse
  hpiRelieving: text("hpi_relieving"), // What makes it better
  hpiTiming: text("hpi_timing"), // When does it occur
  hpiSeverity: text("hpi_severity"), // How bad (1-10 or description)
  hpiAssociatedSymptoms: text("hpi_associated_symptoms"),
  hpiContext: text("hpi_context"), // Social/environmental context
  hpiNarrative: text("hpi_narrative"), // Free-text HPI
  // Review of Systems (store as JSON strings)
  rosConstitutional: text("ros_constitutional"), // Weight loss, fever, fatigue, etc.
  rosEyes: text("ros_eyes"),
  rosEnt: text("ros_ent"), // Ears, nose, throat
  rosCardiovascular: text("ros_cardiovascular"),
  rosRespiratory: text("ros_respiratory"),
  rosGastrointestinal: text("ros_gi"),
  rosGenitourinary: text("ros_gu"),
  rosMusculoskeletal: text("ros_musculoskeletal"),
  rosSkin: text("ros_skin"),
  rosNeurological: text("ros_neurological"),
  rosPsychiatric: text("ros_psychiatric"),
  rosEndocrine: text("ros_endocrine"),
  rosHematologic: text("ros_hematologic"),
  rosAllergic: text("ros_allergic"),
  // Physical Exam
  peGeneral: text("pe_general"), // General appearance
  peVitals: text("pe_vitals"), // Vital signs summary
  peHead: text("pe_head"),
  peEyes: text("pe_eyes"),
  peEnt: text("pe_ent"),
  peNeck: text("pe_neck"),
  peChest: text("pe_chest"),
  peLungs: text("pe_lungs"),
  peHeart: text("pe_heart"),
  peAbdomen: text("pe_abdomen"),
  peBack: text("pe_back"),
  peExtremities: text("pe_extremities"),
  peSkin: text("pe_skin"),
  peNeurological: text("pe_neurological"),
  pePsychiatric: text("pe_psychiatric"),
  // ROS and PE checkbox data (stored as JSON arrays)
  rosChecklist: text("ros_checklist"), // JSON: { constitutional: ["fever", "weight_loss"], ... }
  peChecklist: text("pe_checklist"), // JSON: { general: ["well_appearing"], ... }
  // Diagnosis Codes (ICD-10)
  diagnosisCodes: text("diagnosis_codes"), // JSON array: [{ code: "J06.9", description: "Acute upper respiratory infection", isPrimary: true }]
  // Procedure Codes (CPT)
  procedureCodes: text("procedure_codes"), // JSON array: [{ code: "99213", description: "Office visit, established patient, low complexity" }]
  // Medications prescribed/managed in this encounter
  medications: text("medications"), // JSON array: [{ name: "Amoxicillin", dose: "500mg", frequency: "TID", duration: "10 days", instructions: "Take with food" }]
  // Assessment & Plan link - usually in separate SOAP note
  assessmentSummary: text("assessment_summary"),
  planSummary: text("plan_summary"),
  // Status
  status: text("status").default("in_progress"), // 'in_progress', 'completed', 'signed', 'pending_cosign'
  signedAt: timestamp("signed_at"),
  signedBy: varchar("signed_by"),
  // Co-signature workflow for mid-levels
  requiresCosignature: boolean("requires_cosignature").default(false), // Whether this encounter needs physician co-sign
  cosignedAt: timestamp("cosigned_at"),
  cosignedBy: varchar("cosigned_by"), // Supervising physician who co-signed
  cosignatureNotes: text("cosignature_notes"), // Optional notes from supervising physician
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPatientEncounterSchema = createInsertSchema(patientEncounters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PatientEncounter = typeof patientEncounters.$inferSelect;
export type InsertPatientEncounter = z.infer<typeof insertPatientEncounterSchema>;

// Appointments - scheduling system
export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), // Provider
  organizationId: integer("organization_id"), // Practice/org this appointment belongs to
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
  organizationId: integer("organization_id"), // Practice/org this document belongs to
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

// Audit Logs - HIPAA compliance for tracking PHI access
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  userEmail: text("user_email"),
  organizationId: integer("organization_id"), // For tracking org-level access
  action: text("action").notNull(), // 'view', 'create', 'update', 'delete', 'export', 'login', 'logout'
  resourceType: text("resource_type").notNull(), // 'patient', 'note', 'appointment', 'document'
  resourceId: integer("resource_id"),
  patientId: integer("patient_id"), // For tracking patient-specific access
  details: text("details"), // JSON string with additional context
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  timestamp: true,
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// External API Keys - for third-party integrations (e.g., urgent care websites)
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  practiceId: integer("practice_id").notNull(), // Which organization owns this key
  name: text("name").notNull(), // Human-readable name (e.g., "Urgent Care Portal")
  keyPrefix: varchar("key_prefix", { length: 8 }).notNull(), // First 8 chars for identification (e.g., "dw_live_")
  keyHash: text("key_hash").notNull(), // SHA-256 hash of the full API key
  scopes: text("scopes").array().notNull(), // Array of allowed scopes: 'patients:read', 'patients:write', 'encounters:write', etc.
  status: text("status").notNull().default("active"), // 'active', 'revoked', 'expired'
  rateLimitPerMinute: integer("rate_limit_per_minute").default(60), // Rate limit
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"), // Optional expiration
  createdBy: varchar("created_by").notNull(), // User who created the key
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  revokedAt: timestamp("revoked_at"),
  revokedBy: varchar("revoked_by"),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
  revokedBy: true,
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

// API Key Scopes - defines what each scope allows
export const API_KEY_SCOPES = {
  'patients:read': 'Search and view patient records',
  'patients:write': 'Create and update patient records',
  'encounters:read': 'View encounter records',
  'encounters:write': 'Create and update encounters',
  'appointments:read': 'View appointments',
  'appointments:write': 'Create and manage appointments',
  'notes:read': 'View clinical notes',
  'notes:write': 'Create clinical notes',
} as const;

export type ApiKeyScope = keyof typeof API_KEY_SCOPES;
