import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserProfileImage(id: string, profileImageUrl: string | null): Promise<User | undefined>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    try {
      const [user] = await db
        .insert(users)
        .values(userData)
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            profileImageUrl: userData.profileImageUrl,
            updatedAt: new Date(),
          },
        })
        .returning();
      return user;
    } catch (error: any) {
      if (error.code === "23505" && error.constraint?.includes("email")) {
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.email, userData.email!))
          .limit(1);
        if (existingUser.length > 0) {
          const [updated] = await db
            .update(users)
            .set({
              id: userData.id,
              firstName: userData.firstName,
              lastName: userData.lastName,
              profileImageUrl: userData.profileImageUrl,
              updatedAt: new Date(),
            })
            .where(eq(users.email, userData.email!))
            .returning();
          return updated;
        }
      }
      throw error;
    }
  }

  async updateUserProfileImage(id: string, profileImageUrl: string | null): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({
        profileImageUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }
}

export const authStorage = new AuthStorage();
