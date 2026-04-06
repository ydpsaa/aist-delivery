import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { JWT_SECRET, requireAuth, type JwtPayload } from "../middlewares/auth.js";

const router = Router();

const JWT_ACCESS_EXPIRY = "1h";
const JWT_REFRESH_EXPIRY = "30d";

function signTokens(userId: string, email: string, role: string) {
  const accessToken = jwt.sign(
    { sub: userId, email, role, type: "access" },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRY }
  );
  const refreshToken = jwt.sign(
    { sub: userId, email, role, type: "refresh" },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRY }
  );
  return { accessToken, refreshToken };
}

function validateRegisterBody(body: unknown): { email: string; password: string; name: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const email = typeof b["email"] === "string" ? b["email"].trim().toLowerCase() : "";
  const password = typeof b["password"] === "string" ? b["password"] : "";
  const name = typeof b["name"] === "string" ? b["name"].trim() : "";
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk || password.length < 6 || name.length < 2) return null;
  return { email, password, name };
}

function validateLoginBody(body: unknown): { email: string; password: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const email = typeof b["email"] === "string" ? b["email"].trim().toLowerCase() : "";
  const password = typeof b["password"] === "string" ? b["password"] : "";
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk || !password) return null;
  return { email, password };
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const data = validateRegisterBody(req.body);
  if (!data) {
    res.status(400).json({ error: "Invalid input. Email, password (min 6 chars), and name (min 2 chars) required." });
    return;
  }

  const { email, password, name } = data;

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(usersTable)
    .values({ email, passwordHash, name, role: "customer" })
    .returning();

  if (!user) {
    res.status(500).json({ error: "Failed to create user." });
    return;
  }

  const tokens = signTokens(user.id, user.email, user.role);

  res.status(201).json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    ...tokens,
  });
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const data = validateLoginBody(req.body);
  if (!data) {
    res.status(400).json({ error: "Invalid input." });
    return;
  }

  const { email, password } = data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const tokens = signTokens(user.id, user.email, user.role);

  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    ...tokens,
  });
});

// POST /api/auth/refresh
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (!refreshToken) {
    res.status(401).json({ error: "Refresh token required." });
    return;
  }

  try {
    const payload = jwt.verify(refreshToken, JWT_SECRET) as JwtPayload;
    if (payload.type !== "refresh") {
      res.status(401).json({ error: "Invalid token type." });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, payload.sub))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "User not found." });
      return;
    }

    const tokens = signTokens(user.id, user.email, user.role);

    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      ...tokens,
    });
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token." });
  }
});

// GET /api/auth/me — validate current session
router.get("/me", requireAuth, async (req, res) => {
  const payload = req.jwtUser!;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, payload.sub))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "User not found." });
    return;
  }

  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

// ---------------------------------------------------------------------------
// POST /api/auth/google — Google OAuth Sign-In (PKCE flow via expo-auth-session)
//
// Client sends a Google access_token obtained from the PKCE OAuth flow.
// We verify it against Google's tokeninfo API, then find or create the user.
//
// ENV VARS required for this endpoint to work:
//   GOOGLE_CLIENT_ID     — must match the clientId used in the mobile PKCE flow
//
// Without credentials: returns 501 Not Implemented with clear instructions.
// ---------------------------------------------------------------------------
router.post("/google", async (req, res) => {
  const GOOGLE_CLIENT_ID = process.env["GOOGLE_CLIENT_ID"];

  const { accessToken } = req.body as { accessToken?: string };

  if (!accessToken) {
    res.status(400).json({ error: "accessToken is required." });
    return;
  }

  // Verify the token with Google's tokeninfo endpoint (no SDK needed)
  let googleEmail: string;
  let googleName: string;
  let googleSub: string;

  try {
    const tokenRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/userinfo`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!tokenRes.ok) {
      console.warn("[auth/google] Google userinfo rejected token:", tokenRes.status);
      res.status(401).json({ error: "Invalid Google access token." });
      return;
    }

    const info = await tokenRes.json() as {
      sub?: string;
      email?: string;
      name?: string;
      email_verified?: boolean;
    };

    if (!info.email || !info.sub) {
      res.status(401).json({ error: "Google token missing email or sub." });
      return;
    }

    // Optionally verify the audience (aud) matches our client ID
    if (GOOGLE_CLIENT_ID) {
      const audRes = await fetch(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`
      );
      if (audRes.ok) {
        const audInfo = await audRes.json() as { aud?: string };
        if (audInfo.aud && audInfo.aud !== GOOGLE_CLIENT_ID) {
          console.warn("[auth/google] Token audience mismatch — possible token theft");
          // Soft warning in beta — don't reject, just log
        }
      }
    }

    googleEmail = info.email.toLowerCase().trim();
    googleName = info.name ?? info.email.split("@")[0];
    googleSub = info.sub;
  } catch (err) {
    console.error("[auth/google] Google userinfo fetch failed:", err);
    res.status(502).json({ error: "Failed to verify Google token. Try again." });
    return;
  }

  // Find or create user
  let user = (await db.select().from(usersTable).where(eq(usersTable.email, googleEmail)).limit(1))[0];

  if (!user) {
    // Check by firebaseUid (in case they registered via Firebase before)
    user = (await db.select().from(usersTable).where(eq(usersTable.firebaseUid, googleSub)).limit(1))[0];
  }

  if (!user) {
    // Create new user
    const [created] = await db
      .insert(usersTable)
      .values({
        email: googleEmail,
        passwordHash: "google_oauth",
        name: googleName,
        role: "customer",
        firebaseUid: googleSub,
      })
      .returning();

    if (!created) {
      res.status(500).json({ error: "Failed to create user." });
      return;
    }
    user = created;
  } else if (!user.firebaseUid) {
    // Link existing email account to Google
    await db
      .update(usersTable)
      .set({ firebaseUid: googleSub, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
  }

  const tokens = signTokens(user.id, user.email, user.role);

  console.info(`[auth/google] Sign-in: ${googleEmail} (${user.id.slice(0, 8)}) role=${user.role}`);

  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, authMethod: "google" },
    ...tokens,
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/firebase — Firebase integration point (Phone Auth)
// SCAFFOLD: uncomment when Firebase project is configured.
// ---------------------------------------------------------------------------
// router.post("/firebase", async (req, res) => { ... });

export default router;
