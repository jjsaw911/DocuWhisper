import { notes, subscriptions, templates, invites, userSettings, tasks, practices, practiceMembers, sharedNotes, patients, appointments, patientDocuments, patientVitals, patientEncounters, auditLogs, transcriptionMetrics, apiKeys, personalApiKeys, users, type Note, type InsertNote, type Subscription, type InsertSubscription, type Template, type InsertTemplate, type Invite, type InsertInvite, type UserSettings, type InsertUserSettings, type Task, type InsertTask, type Practice, type InsertPractice, type PracticeMember, type InsertPracticeMember, type SharedNote, type InsertSharedNote, type Patient, type InsertPatient, type Appointment, type InsertAppointment, type PatientDocument, type InsertPatientDocument, type PatientVitals, type InsertPatientVitals, type PatientEncounter, type InsertPatientEncounter, type AuditLog, type InsertAuditLog, type TranscriptionMetric, type InsertTranscriptionMetric, type ApiKey, type InsertApiKey, type PersonalApiKey, type InsertPersonalApiKey } from "@shared/schema";
import crypto from "crypto";
import { db } from "./db";
import { eq, desc, and, asc, sql, isNull, or, gte, lte, arrayContains, count, inArray } from "drizzle-orm";

export interface IStorage {
  getNotesByUser(userId: string): Promise<Note[]>;
  getNote(id: number): Promise<Note | undefined>;
  createNote(note: InsertNote): Promise<Note>;
  updateNote(id: number, note: Partial<InsertNote>): Promise<Note | undefined>;
  deleteNote(id: number): Promise<void>;
  getSubscription(userId: string): Promise<Subscription | undefined>;
  getSubscriptionByStripeCustomerId(stripeCustomerId: string): Promise<Subscription | undefined>;
  getSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string): Promise<Subscription | undefined>;
  upsertSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(userId: string, data: Partial<InsertSubscription>): Promise<Subscription | undefined>;
  getTemplatesByUser(userId: string): Promise<Template[]>;
  getTemplate(id: number): Promise<Template | undefined>;
  createTemplate(template: InsertTemplate): Promise<Template>;
  updateTemplate(id: number, data: Partial<InsertTemplate>): Promise<Template | undefined>;
  deleteTemplate(id: number): Promise<void>;
  setDefaultTemplate(userId: string, templateId: number): Promise<void>;
  getDefaultTemplateId(userId: string): Promise<number | undefined>;
  // Admin functions
  getAllSubscriptions(): Promise<Subscription[]>;
  extendSubscription(userId: string, newPeriodEnd: Date): Promise<Subscription | undefined>;
  // Invite functions
  createInvite(invite: InsertInvite): Promise<Invite>;
  getInviteByCode(code: string): Promise<Invite | undefined>;
  getAllInvites(): Promise<Invite[]>;
  useInvite(code: string, userId: string): Promise<Invite | undefined>;
  deleteInvite(id: number): Promise<void>;
  // User settings functions
  getUserSettings(userId: string): Promise<UserSettings | undefined>;
  upsertUserSettings(settings: InsertUserSettings): Promise<UserSettings>;
  // Task functions
  getTasksByUser(userId: string): Promise<Task[]>;
  getTasksByNote(noteId: number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, data: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<void>;
  completeTask(id: number): Promise<Task | undefined>;
  uncompleteTask(id: number): Promise<Task | undefined>;
  // Template sharing
  getPublicTemplates(): Promise<Template[]>;
  getSharedTemplates(userId: string): Promise<Template[]>;
  // Analytics
  getAnalytics(userId: string, fromDate?: Date, toDate?: Date): Promise<{
    totalNotes: number;
    notesThisWeek: number;
    totalTasks: number;
    tasksCompleted: number;
    tasksPending: number;
    notesThisMonth: number;
    tasksCompletedThisWeek: number;
  }>;
  // Email digest
  getUsersWithEmailNotifications(): Promise<UserSettings[]>;
  // Admin - get all users
  getAllUserSettings(): Promise<UserSettings[]>;
  getAllUsers(): Promise<{ id: string; email: string | null; firstName: string | null; lastName: string | null; createdAt: Date | null }[]>;
  getUserById(userId: string): Promise<{ id: string; email: string | null; firstName: string | null; lastName: string | null; createdAt: Date | null } | undefined>;
  searchUsers(query: string, excludeUserId?: string, limit?: number): Promise<{ id: string; email: string | null; firstName: string | null; lastName: string | null; createdAt: Date | null }[]>;
  deleteUserAndData(userId: string): Promise<void>;
  // Practice/Team functions
  createPractice(practice: InsertPractice): Promise<Practice>;
  getPractice(id: number): Promise<Practice | undefined>;
  getPracticesByUser(userId: string): Promise<Practice[]>;
  updatePractice(id: number, data: Partial<InsertPractice>): Promise<Practice | undefined>;
  deletePractice(id: number): Promise<void>;
  // Practice member functions
  addPracticeMember(member: InsertPracticeMember): Promise<PracticeMember>;
  getPracticeMembers(practiceId: number): Promise<PracticeMember[]>;
  removePracticeMember(practiceId: number, userId: string): Promise<void>;
  updatePracticeMemberRole(practiceId: number, userId: string, role: string): Promise<PracticeMember | undefined>;
  getUserPractices(userId: string): Promise<{ practice: Practice; role: string }[]>;
  // Shared notes functions
  shareNote(sharedNote: InsertSharedNote): Promise<SharedNote>;
  getSharedNotesForUser(userId: string): Promise<{ note: Note; sharedBy: string; permission: string }[]>;
  getSharedNotesForPractice(practiceId: number): Promise<{ note: Note; sharedBy: string; permission: string }[]>;
  getNoteShareInfo(noteId: number): Promise<SharedNote[]>;
  getShareById(shareId: number): Promise<SharedNote | undefined>;
  unshareNote(sharedNoteId: number): Promise<void>;
  // Advanced analytics
  getProductivityTrends(userId: string, days: number, fromDate?: Date): Promise<{ date: string; noteCount: number }[]>;
  getTrendingDiagnoses(userId: string, fromDate?: Date, toDate?: Date): Promise<{ diagnosis: string; count: number }[]>;
  // EMR - Patient functions
  getPatientsByUser(userId: string): Promise<Patient[]>;
  getRecentlySeenPatientsByUser(userId: string, since: Date): Promise<Patient[]>;
  getPatient(id: number): Promise<Patient | undefined>;
  createPatient(patient: InsertPatient): Promise<Patient>;
  updatePatient(id: number, data: Partial<InsertPatient>): Promise<Patient | undefined>;
  deletePatient(id: number): Promise<void>;
  searchPatients(userId: string, query: string): Promise<Patient[]>;
  searchPatientsByOrganization(organizationId: number, query: string): Promise<Patient[]>;
  // EMR - Appointment functions
  getAppointmentsByUser(userId: string): Promise<Appointment[]>;
  getAppointmentsByPatient(patientId: number): Promise<Appointment[]>;
  getAppointment(id: number): Promise<Appointment | undefined>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: number, data: Partial<InsertAppointment>): Promise<Appointment | undefined>;
  deleteAppointment(id: number): Promise<void>;
  getUpcomingAppointments(userId: string, days: number): Promise<Appointment[]>;
  // EMR - Document functions
  getDocumentsByPatient(patientId: number): Promise<PatientDocument[]>;
  getDocument(id: number): Promise<PatientDocument | undefined>;
  createDocument(document: InsertPatientDocument): Promise<PatientDocument>;
  deleteDocument(id: number): Promise<void>;
  // EMR - Note linking
  getNotesByPatient(patientId: number): Promise<Note[]>;
  linkNoteToPatient(noteId: number, patientId: number): Promise<Note | undefined>;
  // EMR access (individual - legacy)
  grantEmrAccess(userId: string): Promise<Subscription | undefined>;
  // Organization EMR License Management
  grantEmrLicenseToOrganization(practiceId: number, licenseType: string, expiryDate: Date | null, maxUsers?: number): Promise<Practice | undefined>;
  revokeEmrLicenseFromOrganization(practiceId: number): Promise<Practice | undefined>;
  getAllOrganizationsWithEmr(): Promise<Practice[]>;
  getAllOrganizations(): Promise<Practice[]>;
  // Organization EMR User Management
  grantEmrAccessToMember(practiceId: number, userId: string, emrRole?: string): Promise<PracticeMember | undefined>;
  revokeEmrAccessFromMember(practiceId: number, userId: string): Promise<PracticeMember | undefined>;
  updateMemberEmrRole(practiceId: number, userId: string, emrRole: string): Promise<PracticeMember | undefined>;
  getOrganizationEmrMembers(practiceId: number): Promise<PracticeMember[]>;
  getUserEmrOrganizations(userId: string): Promise<{ practice: Practice; emrRole: string | null }[]>;
  // Organization-scoped EMR data
  getPatientsByOrganization(organizationId: number): Promise<Patient[]>;
  getRecentlySeenPatientsByOrganization(organizationId: number, since: Date): Promise<Patient[]>;
  getAppointmentsByOrganization(organizationId: number): Promise<Appointment[]>;
  getUpcomingAppointmentsByOrganization(organizationId: number, days?: number): Promise<Appointment[]>;
  // EMR - Vitals functions
  getVitalsByPatient(patientId: number): Promise<PatientVitals[]>;
  getVitals(id: number): Promise<PatientVitals | undefined>;
  createVitals(vitals: InsertPatientVitals): Promise<PatientVitals>;
  updateVitals(id: number, data: Partial<InsertPatientVitals>): Promise<PatientVitals | undefined>;
  deleteVitals(id: number): Promise<void>;
  getLatestVitals(patientId: number): Promise<PatientVitals | undefined>;
  // EMR - Encounter functions
  getEncountersByPatient(patientId: number): Promise<PatientEncounter[]>;
  getEncounter(id: number): Promise<PatientEncounter | undefined>;
  createEncounter(encounter: InsertPatientEncounter): Promise<PatientEncounter>;
  updateEncounter(id: number, data: Partial<InsertPatientEncounter>): Promise<PatientEncounter | undefined>;
  deleteEncounter(id: number): Promise<void>;
  signEncounter(id: number, userId: string): Promise<PatientEncounter | undefined>;
  reopenEncounter(id: number): Promise<PatientEncounter | undefined>;
  cosignEncounter(id: number, physicianId: string, notes?: string): Promise<PatientEncounter | undefined>;
  getEncountersPendingCosign(physicianId: string): Promise<PatientEncounter[]>;
  // Audit logging - HIPAA compliance
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(filters?: { userId?: string; patientId?: number; resourceType?: string; startDate?: Date; endDate?: Date }): Promise<AuditLog[]>;
  // Transcription telemetry
  createTranscriptionMetric(metric: InsertTranscriptionMetric): Promise<TranscriptionMetric>;
  getTranscriptionMetrics(filters?: { startDate?: Date; endDate?: Date; channel?: string; limit?: number }): Promise<TranscriptionMetric[]>;
  // External API Keys
  createApiKey(data: { practiceId: number; name: string; scopes: string[]; createdBy: string; rateLimitPerMinute?: number; expiresAt?: Date }): Promise<{ apiKey: ApiKey; rawKey: string }>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  getApiKeysByPractice(practiceId: number): Promise<ApiKey[]>;
  revokeApiKey(id: number, revokedBy: string): Promise<ApiKey | undefined>;
  updateApiKeyLastUsed(id: number): Promise<void>;
  deleteApiKey(id: number): Promise<void>;
  // Personal API Keys (mobile/personal integrations)
  createPersonalApiKey(data: { userId: string; name: string; scopes: string[] }): Promise<{ apiKey: PersonalApiKey; rawKey: string }>;
  getPersonalApiKeyByHash(keyHash: string): Promise<PersonalApiKey | undefined>;
  getPersonalApiKeysByUser(userId: string): Promise<PersonalApiKey[]>;
  revokePersonalApiKey(id: number): Promise<PersonalApiKey | undefined>;
  updatePersonalApiKeyLastUsed(id: number): Promise<void>;
  deletePersonalApiKey(id: number): Promise<void>;
}

class DatabaseStorage implements IStorage {
  async getNotesByUser(userId: string): Promise<Note[]> {
    return db.select().from(notes).where(eq(notes.userId, userId)).orderBy(desc(notes.createdAt));
  }

  async getNote(id: number): Promise<Note | undefined> {
    const [note] = await db.select().from(notes).where(eq(notes.id, id));
    return note;
  }

  async createNote(note: InsertNote): Promise<Note> {
    const [created] = await db.insert(notes).values(note).returning();
    return created;
  }

  async updateNote(id: number, data: Partial<InsertNote>): Promise<Note | undefined> {
    const [updated] = await db
      .update(notes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(notes.id, id))
      .returning();
    return updated;
  }

  async deleteNote(id: number): Promise<void> {
    await db.delete(notes).where(eq(notes.id, id));
  }

  async getSubscription(userId: string): Promise<Subscription | undefined> {
    const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    return subscription;
  }

  async getSubscriptionByStripeCustomerId(stripeCustomerId: string): Promise<Subscription | undefined> {
    const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.stripeCustomerId, stripeCustomerId));
    return subscription;
  }

  async getSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string): Promise<Subscription | undefined> {
    const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
    return subscription;
  }

  async upsertSubscription(data: InsertSubscription): Promise<Subscription> {
    const [subscription] = await db
      .insert(subscriptions)
      .values(data)
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return subscription;
  }

  async updateSubscription(userId: string, data: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    // Use upsert to create subscription if it doesn't exist
    const [result] = await db
      .insert(subscriptions)
      .values({ 
        userId,
        status: "inactive",
        ...data,
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return result;
  }

  async getTemplatesByUser(userId: string): Promise<Template[]> {
    return db.select().from(templates).where(eq(templates.userId, userId)).orderBy(desc(templates.createdAt));
  }

  async getTemplate(id: number): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(eq(templates.id, id));
    return template;
  }

  async createTemplate(template: InsertTemplate): Promise<Template> {
    const [created] = await db.insert(templates).values(template).returning();
    return created;
  }

  async updateTemplate(id: number, data: Partial<InsertTemplate>): Promise<Template | undefined> {
    const [updated] = await db
      .update(templates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(templates.id, id))
      .returning();
    return updated;
  }

  async deleteTemplate(id: number): Promise<void> {
    await db.delete(templates).where(eq(templates.id, id));
  }

  async setDefaultTemplate(userId: string, templateId: number): Promise<void> {
    // Clear isDefault on all user templates, then set the new one
    await db.update(templates).set({ isDefault: false }).where(eq(templates.userId, userId));
    await db.update(templates).set({ isDefault: true }).where(and(eq(templates.id, templateId), eq(templates.userId, userId)));
    
    // Sync with user_settings.defaultTemplateId so both systems stay consistent
    await db
      .insert(userSettings)
      .values({ userId, defaultTemplateId: templateId })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { defaultTemplateId: templateId, updatedAt: new Date() },
      });
  }

  async getDefaultTemplateId(userId: string): Promise<number | undefined> {
    // First check user_settings.defaultTemplateId
    const settings = await this.getUserSettings(userId);
    if (settings?.defaultTemplateId) {
      return settings.defaultTemplateId;
    }
    
    // Fallback: check for a template marked as isDefault
    const [defaultTemplate] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.userId, userId), eq(templates.isDefault, true)))
      .limit(1);
    
    return defaultTemplate?.id;
  }

  // Admin functions
  async getAllSubscriptions(): Promise<Subscription[]> {
    return db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt));
  }

  async extendSubscription(userId: string, newPeriodEnd: Date): Promise<Subscription | undefined> {
    // Use upsert to create subscription if it doesn't exist
    const [result] = await db
      .insert(subscriptions)
      .values({ 
        userId,
        status: "active",
        currentPeriodEnd: newPeriodEnd,
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: { 
          currentPeriodEnd: newPeriodEnd,
          status: "active",
          updatedAt: new Date() 
        },
      })
      .returning();
    return result;
  }

  // Invite functions
  async createInvite(invite: InsertInvite): Promise<Invite> {
    const [created] = await db.insert(invites).values(invite).returning();
    return created;
  }

  async getInviteByCode(code: string): Promise<Invite | undefined> {
    const [invite] = await db.select().from(invites).where(eq(invites.code, code));
    return invite;
  }

  async getAllInvites(): Promise<Invite[]> {
    return db.select().from(invites).orderBy(desc(invites.createdAt));
  }

  async useInvite(code: string, userId: string): Promise<Invite | undefined> {
    const [updated] = await db
      .update(invites)
      .set({ usedBy: userId, usedAt: new Date() })
      .where(and(eq(invites.code, code), isNull(invites.usedBy)))
      .returning();
    return updated;
  }

  async deleteInvite(id: number): Promise<void> {
    await db.delete(invites).where(eq(invites.id, id));
  }

  // User settings functions
  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return settings;
  }

  async upsertUserSettings(data: InsertUserSettings): Promise<UserSettings> {
    const [settings] = await db
      .insert(userSettings)
      .values(data)
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return settings;
  }

  // Task functions
  async getTasksByUser(userId: string): Promise<Task[]> {
    return db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(desc(tasks.createdAt));
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async createTask(task: InsertTask): Promise<Task> {
    const [created] = await db.insert(tasks).values(task).returning();
    return created;
  }

  async updateTask(id: number, data: Partial<InsertTask>): Promise<Task | undefined> {
    const [updated] = await db
      .update(tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return updated;
  }

  async deleteTask(id: number): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async completeTask(id: number): Promise<Task | undefined> {
    const [updated] = await db
      .update(tasks)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return updated;
  }

  async uncompleteTask(id: number): Promise<Task | undefined> {
    const [updated] = await db
      .update(tasks)
      .set({ status: "todo", completedAt: null, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return updated;
  }

  async getTasksByNote(noteId: number): Promise<Task[]> {
    return db.select().from(tasks).where(eq(tasks.noteId, noteId)).orderBy(desc(tasks.createdAt));
  }

  // Template sharing
  async getPublicTemplates(): Promise<Template[]> {
    return db.select().from(templates).where(eq(templates.isPublic, true)).orderBy(desc(templates.createdAt));
  }

  async getSharedTemplates(userId: string): Promise<Template[]> {
    return db.select().from(templates).where(
      and(
        eq(templates.isPublic, false),
        arrayContains(templates.sharedWith, [userId])
      )
    ).orderBy(desc(templates.createdAt));
  }

  // Analytics
  async getAnalytics(userId: string, fromDate?: Date, toDate?: Date): Promise<{
    totalNotes: number;
    notesThisWeek: number;
    totalTasks: number;
    tasksCompleted: number;
    tasksPending: number;
    notesThisMonth: number;
    tasksCompletedThisWeek: number;
  }> {
    const now = new Date();
    const endDate = toDate || now;
    const startDate = fromDate || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const weekAgo = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Analytics based on the provided date range (or default to last 30 days)
    const [totalNotesResult] = await db.select({ count: count() }).from(notes).where(
      and(
        eq(notes.userId, userId), 
        gte(notes.createdAt, startDate),
        sql`${notes.createdAt} <= ${endDate}`
      )
    );
    const [notesThisWeekResult] = await db.select({ count: count() }).from(notes).where(
      and(
        eq(notes.userId, userId), 
        gte(notes.createdAt, weekAgo),
        sql`${notes.createdAt} <= ${endDate}`
      )
    );
    const [notesThisMonthResult] = await db.select({ count: count() }).from(notes).where(
      and(
        eq(notes.userId, userId), 
        gte(notes.createdAt, startDate),
        sql`${notes.createdAt} <= ${endDate}`
      )
    );
    // Tasks within the date range
    const [totalTasksResult] = await db.select({ count: count() }).from(tasks).where(
      and(
        eq(tasks.userId, userId), 
        gte(tasks.createdAt, startDate),
        sql`${tasks.createdAt} <= ${endDate}`
      )
    );
    const [tasksCompletedResult] = await db.select({ count: count() }).from(tasks).where(
      and(
        eq(tasks.userId, userId), 
        eq(tasks.status, "completed"), 
        gte(tasks.createdAt, startDate),
        sql`${tasks.createdAt} <= ${endDate}`
      )
    );
    const [tasksPendingResult] = await db.select({ count: count() }).from(tasks).where(
      and(
        eq(tasks.userId, userId), 
        eq(tasks.status, "todo"), 
        gte(tasks.createdAt, startDate),
        sql`${tasks.createdAt} <= ${endDate}`
      )
    );
    const [tasksCompletedThisWeekResult] = await db.select({ count: count() }).from(tasks).where(
      and(
        eq(tasks.userId, userId), 
        eq(tasks.status, "completed"), 
        gte(tasks.completedAt, weekAgo),
        sql`${tasks.completedAt} <= ${endDate}`
      )
    );

    return {
      totalNotes: totalNotesResult?.count || 0,
      notesThisWeek: notesThisWeekResult?.count || 0,
      totalTasks: totalTasksResult?.count || 0,
      tasksCompleted: tasksCompletedResult?.count || 0,
      tasksPending: tasksPendingResult?.count || 0,
      notesThisMonth: notesThisMonthResult?.count || 0,
      tasksCompletedThisWeek: tasksCompletedThisWeekResult?.count || 0,
    };
  }

  // Email digest
  async getUsersWithEmailNotifications(): Promise<UserSettings[]> {
    return db.select().from(userSettings).where(eq(userSettings.emailNotificationsEnabled, true));
  }

  async getAllUserSettings(): Promise<UserSettings[]> {
    return db.select().from(userSettings).orderBy(desc(userSettings.createdAt));
  }

  async getAllUsers(): Promise<{ id: string; email: string | null; firstName: string | null; lastName: string | null; createdAt: Date | null }[]> {
    return db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      createdAt: users.createdAt,
    }).from(users).orderBy(desc(users.createdAt));
  }

  async getUserById(userId: string): Promise<{ id: string; email: string | null; firstName: string | null; lastName: string | null; createdAt: Date | null } | undefined> {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user;
  }

  async searchUsers(query: string, excludeUserId?: string, limit = 10): Promise<{ id: string; email: string | null; firstName: string | null; lastName: string | null; createdAt: Date | null }[]> {
    const normalized = query.trim().toLowerCase();
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const whereConditions = [];

    if (normalized) {
      const likePattern = `%${normalized}%`;
      const textMatch = or(
        sql`lower(coalesce(${users.firstName}, '')) like ${likePattern}`,
        sql`lower(coalesce(${users.lastName}, '')) like ${likePattern}`,
        sql`lower(trim(coalesce(${users.firstName}, '') || ' ' || coalesce(${users.lastName}, ''))) like ${likePattern}`,
        sql`lower(coalesce(${users.email}, '')) like ${likePattern}`,
        sql`lower(${users.id}) like ${likePattern}`
      );

      if (textMatch) {
        whereConditions.push(textMatch);
      }
    }

    if (excludeUserId) {
      whereConditions.push(sql`${users.id} <> ${excludeUserId}`);
    }

    const baseQuery = db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        createdAt: users.createdAt,
      })
      .from(users);

    const filteredQuery = whereConditions.length > 0
      ? baseQuery.where(and(...whereConditions))
      : baseQuery;

    return filteredQuery
      .orderBy(
        asc(sql`lower(coalesce(${users.lastName}, ''))`),
        asc(sql`lower(coalesce(${users.firstName}, ''))`),
        asc(sql`lower(coalesce(${users.email}, ''))`),
        asc(sql`lower(${users.id})`)
      )
      .limit(safeLimit);
  }

  async deleteUserAndData(userId: string): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        await tx.delete(sharedNotes).where(or(eq(sharedNotes.sharedBy, userId), eq(sharedNotes.sharedWithUserId, userId)));
        await tx.delete(patientDocuments).where(eq(patientDocuments.userId, userId));
        await tx.delete(patientVitals).where(eq(patientVitals.recordedBy, userId));
        await tx.delete(patientEncounters).where(eq(patientEncounters.providerId, userId));
        await tx.delete(appointments).where(eq(appointments.userId, userId));
        await tx.delete(patients).where(eq(patients.userId, userId));
        await tx.delete(tasks).where(eq(tasks.userId, userId));
        await tx.delete(notes).where(eq(notes.userId, userId));
        await tx.delete(practiceMembers).where(eq(practiceMembers.userId, userId));
        await tx.delete(personalApiKeys).where(eq(personalApiKeys.userId, userId));
        await tx.delete(subscriptions).where(eq(subscriptions.userId, userId));
        await tx.delete(templates).where(eq(templates.userId, userId));
        await tx.delete(userSettings).where(eq(userSettings.userId, userId));
        await tx.delete(users).where(eq(users.id, userId));
      });
    } catch (error) {
      console.error("Error deleting user and data:", error);
      throw error;
    }
  }

  // Practice/Team functions
  async createPractice(practice: InsertPractice): Promise<Practice> {
    const [created] = await db.insert(practices).values(practice).returning();
    // Also add the owner as a member with 'owner' role
    await db.insert(practiceMembers).values({
      practiceId: created.id,
      userId: practice.ownerId,
      role: "owner",
      invitedBy: practice.ownerId,
    });
    return created;
  }

  async getPractice(id: number): Promise<Practice | undefined> {
    const [practice] = await db.select().from(practices).where(eq(practices.id, id));
    return practice;
  }

  async getPracticesByUser(userId: string): Promise<Practice[]> {
    return db.select().from(practices).where(eq(practices.ownerId, userId)).orderBy(desc(practices.createdAt));
  }

  async updatePractice(id: number, data: Partial<InsertPractice>): Promise<Practice | undefined> {
    const [updated] = await db
      .update(practices)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(practices.id, id))
      .returning();
    return updated;
  }

  async deletePractice(id: number): Promise<void> {
    // Delete all members and shared notes first
    await db.delete(practiceMembers).where(eq(practiceMembers.practiceId, id));
    await db.delete(sharedNotes).where(eq(sharedNotes.sharedWithPracticeId, id));
    await db.delete(practices).where(eq(practices.id, id));
  }

  // Practice member functions
  async addPracticeMember(member: InsertPracticeMember): Promise<PracticeMember> {
    const [created] = await db.insert(practiceMembers).values(member).returning();
    return created;
  }

  async getPracticeMembers(practiceId: number): Promise<PracticeMember[]> {
    return db.select().from(practiceMembers).where(eq(practiceMembers.practiceId, practiceId));
  }

  async removePracticeMember(practiceId: number, userId: string): Promise<void> {
    await db.delete(practiceMembers).where(
      and(eq(practiceMembers.practiceId, practiceId), eq(practiceMembers.userId, userId))
    );
  }

  async updatePracticeMemberRole(practiceId: number, userId: string, role: string): Promise<PracticeMember | undefined> {
    const [updated] = await db
      .update(practiceMembers)
      .set({ role })
      .where(and(eq(practiceMembers.practiceId, practiceId), eq(practiceMembers.userId, userId)))
      .returning();
    return updated;
  }

  async getUserPractices(userId: string): Promise<{ practice: Practice; role: string }[]> {
    const memberships = await db.select().from(practiceMembers).where(eq(practiceMembers.userId, userId));
    if (memberships.length === 0) return [];
    
    const practiceIds = memberships.map(m => m.practiceId);
    const practicesList = await db.select().from(practices).where(inArray(practices.id, practiceIds));
    
    return practicesList.map(p => ({
      practice: p,
      role: memberships.find(m => m.practiceId === p.id)?.role || "member",
    }));
  }

  // Shared notes functions
  async shareNote(sharedNote: InsertSharedNote): Promise<SharedNote> {
    const [created] = await db.insert(sharedNotes).values(sharedNote).returning();
    return created;
  }

  async getSharedNotesForUser(userId: string): Promise<{ note: Note; sharedBy: string; permission: string }[]> {
    // Get notes shared directly with user
    const directShares = await db.select().from(sharedNotes).where(eq(sharedNotes.sharedWithUserId, userId));
    
    // Get notes shared with practices user belongs to
    const userMemberships = await db.select().from(practiceMembers).where(eq(practiceMembers.userId, userId));
    const practiceIds = userMemberships.map(m => m.practiceId);
    
    let practiceShares: SharedNote[] = [];
    if (practiceIds.length > 0) {
      practiceShares = await db.select().from(sharedNotes).where(inArray(sharedNotes.sharedWithPracticeId, practiceIds));
    }
    
    const allShares = [...directShares, ...practiceShares];
    if (allShares.length === 0) return [];
    
    const noteIds = Array.from(new Set(allShares.map(s => s.noteId)));
    const notesList = await db.select().from(notes).where(inArray(notes.id, noteIds));
    
    return notesList.map(note => {
      const share = allShares.find(s => s.noteId === note.id)!;
      return { note, sharedBy: share.sharedBy, permission: share.permission };
    });
  }

  async getSharedNotesForPractice(practiceId: number): Promise<{ note: Note; sharedBy: string; permission: string }[]> {
    const shares = await db.select().from(sharedNotes).where(eq(sharedNotes.sharedWithPracticeId, practiceId));
    if (shares.length === 0) return [];
    
    const noteIds = shares.map(s => s.noteId);
    const notesList = await db.select().from(notes).where(inArray(notes.id, noteIds));
    
    return notesList.map(note => {
      const share = shares.find(s => s.noteId === note.id)!;
      return { note, sharedBy: share.sharedBy, permission: share.permission };
    });
  }

  async getNoteShareInfo(noteId: number): Promise<SharedNote[]> {
    return db.select().from(sharedNotes).where(eq(sharedNotes.noteId, noteId));
  }

  async getShareById(shareId: number): Promise<SharedNote | undefined> {
    const [share] = await db.select().from(sharedNotes).where(eq(sharedNotes.id, shareId));
    return share;
  }

  async unshareNote(sharedNoteId: number): Promise<void> {
    await db.delete(sharedNotes).where(eq(sharedNotes.id, sharedNoteId));
  }

  // Advanced analytics
  async getProductivityTrends(userId: string, days: number, fromDate?: Date): Promise<{ date: string; noteCount: number }[]> {
    const results: { date: string; noteCount: number }[] = [];
    const startFrom = fromDate || new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(startFrom);
      date.setDate(date.getDate() + i);
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const [result] = await db.select({ count: count() }).from(notes).where(
        and(
          eq(notes.userId, userId),
          gte(notes.createdAt, startOfDay),
          sql`${notes.createdAt} <= ${endOfDay}`
        )
      );
      
      results.push({
        date: startOfDay.toISOString().split('T')[0],
        noteCount: result?.count || 0,
      });
    }
    
    return results;
  }

  async getTrendingDiagnoses(userId: string, fromDate?: Date, toDate?: Date): Promise<{ diagnosis: string; count: number }[]> {
    const startDate = fromDate || new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000);
    const endDate = toDate || new Date();
    
    // Get notes with ICD codes within the date range
    const userNotes = await db.select({ icdCodes: notes.icdCodes }).from(notes).where(
      and(
        eq(notes.userId, userId), 
        sql`${notes.icdCodes} IS NOT NULL AND ${notes.icdCodes} != ''`,
        gte(notes.createdAt, startDate),
        sql`${notes.createdAt} <= ${endDate}`
      )
    );
    
    // Count diagnoses from ICD codes
    const diagnosisCounts: Record<string, number> = {};
    
    for (const note of userNotes) {
      if (!note.icdCodes) continue;
      
      try {
        const parsed = typeof note.icdCodes === 'string' ? JSON.parse(note.icdCodes) : note.icdCodes;
        const codes = parsed?.codes || [];
        
        for (const code of codes) {
          if (code.description) {
            // Use the ICD code description as the diagnosis
            // Format: "CODE - Description" for display
            const diagnosisKey = code.description.toLowerCase().trim();
            const displayName = `${code.code} - ${code.description}`;
            
            if (diagnosisCounts[diagnosisKey]) {
              diagnosisCounts[diagnosisKey]++;
            } else {
              diagnosisCounts[diagnosisKey] = 1;
            }
          }
        }
      } catch (e) {
        console.error("Failed to parse ICD codes for trending diagnoses:", e);
      }
    }
    
    // Sort by count and return top 10
    return Object.entries(diagnosisCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([diagnosis, count]) => ({
        diagnosis: diagnosis.charAt(0).toUpperCase() + diagnosis.slice(1),
        count,
      }));
  }

  // ============ EMR METHODS ============

  // Patient methods
  async getPatientsByUser(userId: string): Promise<Patient[]> {
    return db.select().from(patients).where(eq(patients.userId, userId)).orderBy(desc(patients.createdAt));
  }

  async getRecentlySeenPatientsByUser(userId: string, since: Date): Promise<Patient[]> {
    return db
      .select()
      .from(patients)
      .where(
        and(
          eq(patients.userId, userId),
          sql`EXISTS (
            SELECT 1
            FROM ${patientEncounters}
            WHERE ${patientEncounters.patientId} = ${patients.id}
              AND ${patientEncounters.encounterDate} >= ${since}
          )`,
        ),
      )
      .orderBy(patients.lastName, patients.firstName);
  }

  async getPatient(id: number): Promise<Patient | undefined> {
    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    return patient;
  }

  async createPatient(patient: InsertPatient): Promise<Patient> {
    const [created] = await db.insert(patients).values(patient).returning();
    return created;
  }

  async updatePatient(id: number, data: Partial<InsertPatient>): Promise<Patient | undefined> {
    const [updated] = await db
      .update(patients)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(patients.id, id))
      .returning();
    return updated;
  }

  async deletePatient(id: number): Promise<void> {
    await db.delete(patients).where(eq(patients.id, id));
  }

  async searchPatients(userId: string, query: string): Promise<Patient[]> {
    const searchPattern = `%${query.toLowerCase()}%`;
    return db.select().from(patients).where(
      and(
        eq(patients.userId, userId),
        or(
          sql`LOWER(${patients.firstName}) LIKE ${searchPattern}`,
          sql`LOWER(${patients.lastName}) LIKE ${searchPattern}`,
          sql`LOWER(${patients.email}) LIKE ${searchPattern}`,
          sql`${patients.phone} LIKE ${searchPattern}`
        )
      )
    ).orderBy(patients.lastName, patients.firstName);
  }

  async searchPatientsByOrganization(organizationId: number, query: string): Promise<Patient[]> {
    const searchPattern = `%${query.toLowerCase()}%`;
    return db.select().from(patients).where(
      and(
        eq(patients.organizationId, organizationId),
        or(
          sql`LOWER(${patients.firstName}) LIKE ${searchPattern}`,
          sql`LOWER(${patients.lastName}) LIKE ${searchPattern}`,
          sql`LOWER(${patients.email}) LIKE ${searchPattern}`,
          sql`${patients.phone} LIKE ${searchPattern}`
        )
      )
    ).orderBy(patients.lastName, patients.firstName);
  }

  // Appointment methods
  async getAppointmentsByUser(userId: string): Promise<Appointment[]> {
    return db.select().from(appointments).where(eq(appointments.userId, userId)).orderBy(desc(appointments.startTime));
  }

  async getAppointmentsByPatient(patientId: number): Promise<Appointment[]> {
    return db.select().from(appointments).where(eq(appointments.patientId, patientId)).orderBy(desc(appointments.startTime));
  }

  async getAppointment(id: number): Promise<Appointment | undefined> {
    const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id));
    return appointment;
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const [created] = await db.insert(appointments).values(appointment).returning();
    return created;
  }

  async updateAppointment(id: number, data: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const [updated] = await db
      .update(appointments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(appointments.id, id))
      .returning();
    return updated;
  }

  async deleteAppointment(id: number): Promise<void> {
    await db.delete(appointments).where(eq(appointments.id, id));
  }

  async getUpcomingAppointments(userId: string, days: number): Promise<Appointment[]> {
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    
    return db.select().from(appointments).where(
      and(
        eq(appointments.userId, userId),
        gte(appointments.startTime, now),
        sql`${appointments.startTime} <= ${endDate}`
      )
    ).orderBy(appointments.startTime);
  }

  // Document methods
  async getDocumentsByPatient(patientId: number): Promise<PatientDocument[]> {
    return db.select().from(patientDocuments).where(eq(patientDocuments.patientId, patientId)).orderBy(desc(patientDocuments.uploadedAt));
  }

  async getDocument(id: number): Promise<PatientDocument | undefined> {
    const [doc] = await db.select().from(patientDocuments).where(eq(patientDocuments.id, id));
    return doc;
  }

  async createDocument(document: InsertPatientDocument): Promise<PatientDocument> {
    const [created] = await db.insert(patientDocuments).values(document).returning();
    return created;
  }

  async deleteDocument(id: number): Promise<void> {
    await db.delete(patientDocuments).where(eq(patientDocuments.id, id));
  }

  // Note linking
  async getNotesByPatient(patientId: number): Promise<Note[]> {
    return db.select().from(notes).where(eq(notes.patientId, patientId)).orderBy(desc(notes.createdAt));
  }

  async linkNoteToPatient(noteId: number, patientId: number): Promise<Note | undefined> {
    const [updated] = await db
      .update(notes)
      .set({ patientId, updatedAt: new Date() })
      .where(eq(notes.id, noteId))
      .returning();
    return updated;
  }

  // EMR access (individual user - legacy)
  async grantEmrAccess(userId: string): Promise<Subscription | undefined> {
    const [updated] = await db
      .update(subscriptions)
      .set({ hasEmrAccess: true, updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId))
      .returning();
    return updated;
  }

  // Organization EMR License Management
  async grantEmrLicenseToOrganization(
    practiceId: number, 
    licenseType: string, 
    expiryDate: Date | null,
    maxUsers: number = 5
  ): Promise<Practice | undefined> {
    const [updated] = await db
      .update(practices)
      .set({ 
        hasEmrLicense: true, 
        emrLicenseType: licenseType,
        emrLicenseExpiry: expiryDate,
        emrMaxUsers: maxUsers,
        updatedAt: new Date() 
      })
      .where(eq(practices.id, practiceId))
      .returning();
    return updated;
  }

  async revokeEmrLicenseFromOrganization(practiceId: number): Promise<Practice | undefined> {
    const [updated] = await db
      .update(practices)
      .set({ 
        hasEmrLicense: false, 
        emrLicenseType: null,
        emrLicenseExpiry: null,
        emrActiveUsers: 0,
        updatedAt: new Date() 
      })
      .where(eq(practices.id, practiceId))
      .returning();
    // Also revoke EMR access from all members
    await db.update(practiceMembers)
      .set({ hasEmrAccess: false, emrRole: null })
      .where(eq(practiceMembers.practiceId, practiceId));
    return updated;
  }

  async getAllOrganizationsWithEmr(): Promise<Practice[]> {
    return db.select().from(practices).where(eq(practices.hasEmrLicense, true)).orderBy(desc(practices.createdAt));
  }

  async getAllOrganizations(): Promise<Practice[]> {
    return db.select().from(practices).orderBy(desc(practices.createdAt));
  }

  // Organization EMR User Management
  async grantEmrAccessToMember(
    practiceId: number, 
    userId: string, 
    emrRole: string = 'provider'
  ): Promise<PracticeMember | undefined> {
    // First check if organization has EMR license and available seats
    const practice = await this.getPractice(practiceId);
    if (!practice?.hasEmrLicense) {
      throw new Error("Organization does not have an EMR license");
    }
    
    const currentUsers = practice.emrActiveUsers || 0;
    const maxUsers = practice.emrMaxUsers || 5;
    if (currentUsers >= maxUsers) {
      throw new Error(`Organization has reached maximum EMR users (${maxUsers})`);
    }

    // Grant access to the member
    const [updated] = await db
      .update(practiceMembers)
      .set({ hasEmrAccess: true, emrRole })
      .where(and(eq(practiceMembers.practiceId, practiceId), eq(practiceMembers.userId, userId)))
      .returning();

    // Increment active users count
    if (updated) {
      await db
        .update(practices)
        .set({ emrActiveUsers: currentUsers + 1, updatedAt: new Date() })
        .where(eq(practices.id, practiceId));
    }
    
    return updated;
  }

  async revokeEmrAccessFromMember(practiceId: number, userId: string): Promise<PracticeMember | undefined> {
    const [updated] = await db
      .update(practiceMembers)
      .set({ hasEmrAccess: false, emrRole: null })
      .where(and(eq(practiceMembers.practiceId, practiceId), eq(practiceMembers.userId, userId)))
      .returning();

    // Decrement active users count
    if (updated) {
      const practice = await this.getPractice(practiceId);
      if (practice) {
        const currentUsers = practice.emrActiveUsers || 0;
        await db
          .update(practices)
          .set({ emrActiveUsers: Math.max(0, currentUsers - 1), updatedAt: new Date() })
          .where(eq(practices.id, practiceId));
      }
    }
    
    return updated;
  }

  async updateMemberEmrRole(practiceId: number, userId: string, emrRole: string): Promise<PracticeMember | undefined> {
    const [updated] = await db
      .update(practiceMembers)
      .set({ emrRole })
      .where(and(eq(practiceMembers.practiceId, practiceId), eq(practiceMembers.userId, userId)))
      .returning();
    return updated;
  }

  async getOrganizationEmrMembers(practiceId: number): Promise<PracticeMember[]> {
    return db.select()
      .from(practiceMembers)
      .where(and(eq(practiceMembers.practiceId, practiceId), eq(practiceMembers.hasEmrAccess, true)));
  }

  async getUserEmrOrganizations(userId: string): Promise<{ practice: Practice; emrRole: string | null }[]> {
    const memberships = await db.select()
      .from(practiceMembers)
      .where(and(eq(practiceMembers.userId, userId), eq(practiceMembers.hasEmrAccess, true)));
    
    if (memberships.length === 0) return [];
    
    const practiceIds = memberships.map(m => m.practiceId);
    const practicesList = await db.select()
      .from(practices)
      .where(and(inArray(practices.id, practiceIds), eq(practices.hasEmrLicense, true)));
    
    return practicesList.map(p => ({
      practice: p,
      emrRole: memberships.find(m => m.practiceId === p.id)?.emrRole || null,
    }));
  }

  // Organization-scoped patient methods
  async getPatientsByOrganization(organizationId: number): Promise<Patient[]> {
    return db.select().from(patients).where(eq(patients.organizationId, organizationId)).orderBy(desc(patients.createdAt));
  }

  async getRecentlySeenPatientsByOrganization(organizationId: number, since: Date): Promise<Patient[]> {
    return db
      .select()
      .from(patients)
      .where(
        and(
          eq(patients.organizationId, organizationId),
          sql`EXISTS (
            SELECT 1
            FROM ${patientEncounters}
            WHERE ${patientEncounters.patientId} = ${patients.id}
              AND ${patientEncounters.encounterDate} >= ${since}
          )`,
        ),
      )
      .orderBy(patients.lastName, patients.firstName);
  }

  async getAppointmentsByOrganization(organizationId: number): Promise<Appointment[]> {
    return db.select().from(appointments).where(eq(appointments.organizationId, organizationId)).orderBy(desc(appointments.startTime));
  }

  async getUpcomingAppointmentsByOrganization(organizationId: number, days: number = 7): Promise<Appointment[]> {
    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return db.select().from(appointments).where(
      and(
        eq(appointments.organizationId, organizationId),
        gte(appointments.startTime, now),
        lte(appointments.startTime, futureDate)
      )
    ).orderBy(appointments.startTime);
  }

  // Audit logging - HIPAA compliance
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  async getAuditLogs(filters?: { userId?: string; patientId?: number; resourceType?: string; startDate?: Date; endDate?: Date }): Promise<AuditLog[]> {
    const conditions = [];
    
    if (filters?.userId) {
      conditions.push(eq(auditLogs.userId, filters.userId));
    }
    if (filters?.patientId) {
      conditions.push(eq(auditLogs.patientId, filters.patientId));
    }
    if (filters?.resourceType) {
      conditions.push(eq(auditLogs.resourceType, filters.resourceType));
    }
    if (filters?.startDate) {
      conditions.push(gte(auditLogs.timestamp, filters.startDate));
    }
    
    if (conditions.length === 0) {
      return db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(1000);
    }
    
    return db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.timestamp)).limit(1000);
  }

  async createTranscriptionMetric(metric: InsertTranscriptionMetric): Promise<TranscriptionMetric> {
    const [created] = await db.insert(transcriptionMetrics).values(metric).returning();
    return created;
  }

  async getTranscriptionMetrics(filters?: {
    startDate?: Date;
    endDate?: Date;
    channel?: string;
    limit?: number;
  }): Promise<TranscriptionMetric[]> {
    const conditions = [];
    const limit = Math.min(Math.max(filters?.limit ?? 1000, 1), 10000);

    if (filters?.startDate) {
      conditions.push(gte(transcriptionMetrics.createdAt, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(transcriptionMetrics.createdAt, filters.endDate));
    }
    if (filters?.channel) {
      conditions.push(eq(transcriptionMetrics.channel, filters.channel));
    }

    if (conditions.length === 0) {
      return db
        .select()
        .from(transcriptionMetrics)
        .orderBy(desc(transcriptionMetrics.createdAt))
        .limit(limit);
    }

    return db
      .select()
      .from(transcriptionMetrics)
      .where(and(...conditions))
      .orderBy(desc(transcriptionMetrics.createdAt))
      .limit(limit);
  }

  // Vitals methods
  async getVitalsByPatient(patientId: number): Promise<PatientVitals[]> {
    return db.select().from(patientVitals).where(eq(patientVitals.patientId, patientId)).orderBy(desc(patientVitals.recordedAt));
  }

  async getVitals(id: number): Promise<PatientVitals | undefined> {
    const [vitals] = await db.select().from(patientVitals).where(eq(patientVitals.id, id));
    return vitals;
  }

  async createVitals(vitals: InsertPatientVitals): Promise<PatientVitals> {
    const [created] = await db.insert(patientVitals).values(vitals).returning();
    return created;
  }

  async updateVitals(id: number, data: Partial<InsertPatientVitals>): Promise<PatientVitals | undefined> {
    const [updated] = await db.update(patientVitals).set(data).where(eq(patientVitals.id, id)).returning();
    return updated;
  }

  async deleteVitals(id: number): Promise<void> {
    await db.delete(patientVitals).where(eq(patientVitals.id, id));
  }

  async getLatestVitals(patientId: number): Promise<PatientVitals | undefined> {
    const [vitals] = await db.select().from(patientVitals).where(eq(patientVitals.patientId, patientId)).orderBy(desc(patientVitals.recordedAt)).limit(1);
    return vitals;
  }

  // Encounter methods
  async getEncountersByPatient(patientId: number): Promise<PatientEncounter[]> {
    return db.select().from(patientEncounters).where(eq(patientEncounters.patientId, patientId)).orderBy(desc(patientEncounters.encounterDate));
  }

  async getEncounter(id: number): Promise<PatientEncounter | undefined> {
    const [encounter] = await db.select().from(patientEncounters).where(eq(patientEncounters.id, id));
    return encounter;
  }

  async createEncounter(encounter: InsertPatientEncounter): Promise<PatientEncounter> {
    const [created] = await db.insert(patientEncounters).values(encounter).returning();
    return created;
  }

  async updateEncounter(id: number, data: Partial<InsertPatientEncounter>): Promise<PatientEncounter | undefined> {
    const [updated] = await db.update(patientEncounters).set({ ...data, updatedAt: new Date() }).where(eq(patientEncounters.id, id)).returning();
    return updated;
  }

  async deleteEncounter(id: number): Promise<void> {
    await db.delete(patientEncounters).where(eq(patientEncounters.id, id));
  }

  async signEncounter(id: number, userId: string): Promise<PatientEncounter | undefined> {
    const [signed] = await db.update(patientEncounters).set({
      status: "signed",
      signedAt: new Date(),
      signedBy: userId,
      updatedAt: new Date(),
    }).where(eq(patientEncounters.id, id)).returning();
    return signed;
  }

  async reopenEncounter(id: number): Promise<PatientEncounter | undefined> {
    const [reopened] = await db.update(patientEncounters).set({
      status: "draft",
      signedAt: null,
      signedBy: null,
      updatedAt: new Date(),
    }).where(eq(patientEncounters.id, id)).returning();
    return reopened;
  }

  async cosignEncounter(id: number, physicianId: string, notes?: string): Promise<PatientEncounter | undefined> {
    const [cosigned] = await db.update(patientEncounters).set({
      status: "signed",
      cosignedAt: new Date(),
      cosignedBy: physicianId,
      cosignatureNotes: notes || null,
      updatedAt: new Date(),
    }).where(eq(patientEncounters.id, id)).returning();
    return cosigned;
  }

  async getEncountersPendingCosign(physicianId: string): Promise<PatientEncounter[]> {
    // Get encounters where the provider's supervising physician matches this physician
    // We need to join with user settings to find mid-levels supervised by this physician
    const supervisedSettings = await db.select().from(userSettings).where(eq(userSettings.supervisingPhysicianId, physicianId));
    const supervisedUserIds = supervisedSettings.map(s => s.userId);
    
    if (supervisedUserIds.length === 0) {
      return [];
    }
    
    // Get pending_cosign encounters from supervised providers
    const encounters = await db.select().from(patientEncounters)
      .where(
        and(
          eq(patientEncounters.status, "pending_cosign"),
          eq(patientEncounters.requiresCosignature, true)
        )
      );
    
    // Filter to only those from supervised providers
    return encounters.filter(enc => supervisedUserIds.includes(enc.providerId));
  }

  // External API Key management
  async createApiKey(data: { practiceId: number; name: string; scopes: string[]; createdBy: string; rateLimitPerMinute?: number; expiresAt?: Date }): Promise<{ apiKey: ApiKey; rawKey: string }> {
    // Generate a secure random API key
    const rawKey = `dw_live_${crypto.randomBytes(32).toString('hex')}`;
    const keyPrefix = rawKey.substring(0, 8);
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    
    const [created] = await db.insert(apiKeys).values({
      practiceId: data.practiceId,
      name: data.name,
      keyPrefix,
      keyHash,
      scopes: data.scopes,
      status: "active",
      rateLimitPerMinute: data.rateLimitPerMinute || 60,
      expiresAt: data.expiresAt || null,
      createdBy: data.createdBy,
    }).returning();
    
    return { apiKey: created, rawKey };
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
    return key;
  }

  async getApiKeysByPractice(practiceId: number): Promise<ApiKey[]> {
    return db.select().from(apiKeys)
      .where(eq(apiKeys.practiceId, practiceId))
      .orderBy(desc(apiKeys.createdAt));
  }

  async revokeApiKey(id: number, revokedBy: string): Promise<ApiKey | undefined> {
    const [revoked] = await db.update(apiKeys).set({
      status: "revoked",
      revokedAt: new Date(),
      revokedBy,
    }).where(eq(apiKeys.id, id)).returning();
    return revoked;
  }

  async updateApiKeyLastUsed(id: number): Promise<void> {
    await db.update(apiKeys).set({
      lastUsedAt: new Date(),
    }).where(eq(apiKeys.id, id));
  }

  async deleteApiKey(id: number): Promise<void> {
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
  }

  // Personal API Key management (mobile/personal integrations)
  async createPersonalApiKey(data: { userId: string; name: string; scopes: string[] }): Promise<{ apiKey: PersonalApiKey; rawKey: string }> {
    const rawKey = `dw_pk_${crypto.randomBytes(32).toString('hex')}`;
    const keyPrefix = rawKey.substring(0, 12);
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    
    const [created] = await db.insert(personalApiKeys).values({
      userId: data.userId,
      name: data.name,
      keyPrefix,
      keyHash,
      scopes: data.scopes,
      status: "active",
      rateLimitPerMinute: 30,
    }).returning();
    
    return { apiKey: created, rawKey };
  }

  async getPersonalApiKeyByHash(keyHash: string): Promise<PersonalApiKey | undefined> {
    const [key] = await db.select().from(personalApiKeys).where(eq(personalApiKeys.keyHash, keyHash));
    return key;
  }

  async getPersonalApiKeysByUser(userId: string): Promise<PersonalApiKey[]> {
    return db.select().from(personalApiKeys)
      .where(eq(personalApiKeys.userId, userId))
      .orderBy(desc(personalApiKeys.createdAt));
  }

  async revokePersonalApiKey(id: number): Promise<PersonalApiKey | undefined> {
    const [revoked] = await db.update(personalApiKeys).set({
      status: "revoked",
      revokedAt: new Date(),
    }).where(eq(personalApiKeys.id, id)).returning();
    return revoked;
  }

  async updatePersonalApiKeyLastUsed(id: number): Promise<void> {
    await db.update(personalApiKeys).set({
      lastUsedAt: new Date(),
    }).where(eq(personalApiKeys.id, id));
  }

  async deletePersonalApiKey(id: number): Promise<void> {
    await db.delete(personalApiKeys).where(eq(personalApiKeys.id, id));
  }
}

export const storage = new DatabaseStorage();

// Helper function to hash an API key for lookup
export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}
