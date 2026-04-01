import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { env, isGoogleOAuthConfigured } from "../config/env";

type AppUser = typeof users.$inferSelect;

function normalizeEmail(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function isAllowedGoogleDomain(email: string): boolean {
  return email.endsWith("@iitj.ac.in");
}

function resolveDisplayName(input: {
  profileDisplayName: string | undefined;
  fallbackEmail: string;
}): string {
  const name = input.profileDisplayName?.trim();

  if (name && name.length > 0) {
    return name;
  }

  const [localPart] = input.fallbackEmail.split("@");
  return localPart || "User";
}

passport.serializeUser((user: Express.User, done) => {
  const candidate = user as AppUser;
  done(null, candidate.id);
});

passport.deserializeUser(async (serializedId: string | number, done) => {
  try {
    const userId = Number(serializedId);

    if (!Number.isInteger(userId) || userId <= 0) {
      return done(null, false);
    }

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return done(null, rows[0] ?? false);
  } catch (error) {
    return done(error as Error);
  }
});

if (isGoogleOAuthConfigured) {
  passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID as string,
        clientSecret: env.GOOGLE_CLIENT_SECRET as string,
        callbackURL: env.GOOGLE_CALLBACK_URL as string,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = normalizeEmail(profile.emails?.[0]?.value);

          if (!email || !isAllowedGoogleDomain(email)) {
            return done(null, false, {
              message: "Only @iitj.ac.in Google accounts are allowed",
            });
          }

          const googleId = profile.id;
          const avatarUrl = profile.photos?.[0]?.value ?? null;
          const displayName = resolveDisplayName({
            profileDisplayName: profile.displayName,
            fallbackEmail: email,
          });

          const byGoogleId = await db
            .select()
            .from(users)
            .where(eq(users.googleId, googleId))
            .limit(1);

          if (byGoogleId[0]) {
            const [updated] = await db
              .update(users)
              .set({
                avatarUrl,
                displayName,
                name: displayName,
                registeredVia: "google",
              })
              .where(eq(users.id, byGoogleId[0].id))
              .returning();

            return done(null, updated ?? byGoogleId[0]);
          }

          const byEmail = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

          if (byEmail[0]) {
            const matchedUser = byEmail[0];

            if (matchedUser.registeredVia !== "google") {
              return done(null, false, {
                message:
                  "Email is already registered with password login. Use email/password.",
              });
            }

            if (matchedUser.googleId !== null && matchedUser.googleId !== googleId) {
              return done(null, false, {
                message: "Account conflict for this Google email",
              });
            }

            const [linked] = await db
              .update(users)
              .set({
                googleId,
                avatarUrl,
                displayName,
                name: displayName,
                registeredVia: "google",
              })
              .where(eq(users.id, matchedUser.id))
              .returning();

            return done(null, linked ?? matchedUser);
          }

          const generatedPasswordHash = await bcrypt.hash(
            `oauth_google_${googleId}_${Date.now()}`,
            10,
          );

          const [created] = await db
            .insert(users)
            .values({
              name: displayName,
              email,
              passwordHash: generatedPasswordHash,
              role: "STUDENT",
              googleId,
              avatarUrl,
              displayName,
              department: null,
              isActive: true,
              registeredVia: "google",
              firstLogin: true,
            })
            .returning();

          if (!created) {
            return done(new Error("Failed to create Google OAuth user"));
          }

          return done(null, created);
        } catch (error) {
          return done(error as Error);
        }
      },
    ),
  );
}

export default passport;
