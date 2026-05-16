import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

// Lightweight Supabase client used only to verify JWTs from the mobile app.
const supabaseAuth = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// Extends Express Request with the authenticated user's ID.
declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  // If no auth header, use anonymous fallback for development
  if (!authHeader?.startsWith('Bearer ')) {
    req.userId = '00000000-0000-0000-0000-000000000000';
    next();
    return;
  }

  const token = authHeader.slice(7);

  const { data, error } = await supabaseAuth.auth.getUser(token);

  if (error || !data.user) {
    // Fall back to anonymous in dev instead of rejecting
    req.userId = '00000000-0000-0000-0000-000000000000';
    next();
    return;
  }

  req.userId = data.user.id;
  next();
}
