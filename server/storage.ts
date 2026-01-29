import { notes, subscriptions, templates, invites, userSettings, tasks, type Note, type InsertNote, type Subscription, type InsertSubscription, type Template, type InsertTemplate, type Invite, type InsertInvite, type UserSettings, type InsertUserSettings, type Task, type InsertTask } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, isNull, or, gte, arrayContains, count } from "drizzle-orm";

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
  getAnalytics(userId: string): Promise<{
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
    const [updated] = await db
      .update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId))
      .returning();
    return updated;
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
    await db.update(templates).set({ isDefault: false }).where(eq(templates.userId, userId));
    await db.update(templates).set({ isDefault: true }).where(and(eq(templates.id, templateId), eq(templates.userId, userId)));
  }

  // Admin functions
  async getAllSubscriptions(): Promise<Subscription[]> {
    return db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt));
  }

  async extendSubscription(userId: string, newPeriodEnd: Date): Promise<Subscription | undefined> {
    const [updated] = await db
      .update(subscriptions)
      .set({ 
        currentPeriodEnd: newPeriodEnd,
        status: "active",
        updatedAt: new Date() 
      })
      .where(eq(subscriptions.userId, userId))
      .returning();
    return updated;
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
  async getAnalytics(userId: string): Promise<{
    totalNotes: number;
    notesThisWeek: number;
    totalTasks: number;
    tasksCompleted: number;
    tasksPending: number;
    notesThisMonth: number;
    tasksCompletedThisWeek: number;
  }> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalNotesResult] = await db.select({ count: count() }).from(notes).where(eq(notes.userId, userId));
    const [notesThisWeekResult] = await db.select({ count: count() }).from(notes).where(
      and(eq(notes.userId, userId), gte(notes.createdAt, weekAgo))
    );
    const [notesThisMonthResult] = await db.select({ count: count() }).from(notes).where(
      and(eq(notes.userId, userId), gte(notes.createdAt, monthAgo))
    );
    const [totalTasksResult] = await db.select({ count: count() }).from(tasks).where(eq(tasks.userId, userId));
    const [tasksCompletedResult] = await db.select({ count: count() }).from(tasks).where(
      and(eq(tasks.userId, userId), eq(tasks.status, "completed"))
    );
    const [tasksPendingResult] = await db.select({ count: count() }).from(tasks).where(
      and(eq(tasks.userId, userId), eq(tasks.status, "todo"))
    );
    const [tasksCompletedThisWeekResult] = await db.select({ count: count() }).from(tasks).where(
      and(eq(tasks.userId, userId), eq(tasks.status, "completed"), gte(tasks.completedAt, weekAgo))
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
}

export const storage = new DatabaseStorage();
