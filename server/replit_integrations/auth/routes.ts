import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { z } from "zod";

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  const updateProfileImageSchema = z.object({
    profileImageUrl: z
      .string()
      .trim()
      .max(2_000_000, "Image payload is too large")
      .refine(
        (value) => value.startsWith("data:image/") || value.startsWith("https://"),
        "Profile image must be a valid image URL"
      )
      .nullable(),
  });

  app.put("/api/auth/profile-image", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = updateProfileImageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message || "Invalid profile image payload",
        });
      }

      const updated = await authStorage.updateUserProfileImage(userId, parsed.data.profileImageUrl);
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating profile image:", error);
      res.status(500).json({ message: "Failed to update profile image" });
    }
  });
}
