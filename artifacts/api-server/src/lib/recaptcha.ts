import type { Request, Response, NextFunction } from "express";

export interface RecaptchaVerificationResult {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  errorCodes?: string[];
  reason?: string;
}

// In-memory cache to reject duplicate / replayed tokens
const seenTokens = new Map<string, number>();
const TOKEN_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

export function isTokenReplayed(token: string): boolean {
  const now = Date.now();
  // Periodic cleanup of expired entries
  if (seenTokens.size > 500) {
    for (const [t, ts] of seenTokens.entries()) {
      if (now - ts > TOKEN_CACHE_TTL_MS) {
        seenTokens.delete(t);
      }
    }
  }

  if (seenTokens.has(token)) {
    return true;
  }
  seenTokens.set(token, now);
  return false;
}

export function clearSeenTokensForTest(): void {
  seenTokens.clear();
}

/**
 * Verifies a Google reCAPTCHA v3 response token against Google's siteverify API.
 */
export async function verifyRecaptchaToken(
  token: string | undefined | null,
  expectedAction?: string,
  clientIp?: string,
  options?: { minScore?: number; allowedHostnames?: string[] }
): Promise<RecaptchaVerificationResult> {
  const rawToken = typeof token === "string" ? token.trim() : "";

  // 1. Missing Token Check
  if (!rawToken) {
    return {
      success: false,
      reason: "reCAPTCHA token is missing or empty",
    };
  }

  // 2. Duplicate / Replay Check
  if (isTokenReplayed(rawToken)) {
    return {
      success: false,
      reason: "reCAPTCHA token has already been used (duplicate/replay detected)",
    };
  }

  const isProd = process.env.NODE_ENV === "production";
  const secretKey = process.env.RECAPTCHA_SECRET_KEY || (!isProd ? "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe" : "");

  // 3. Secret Key Configuration Check
  if (!secretKey) {
    console.error("[reCAPTCHA] RECAPTCHA_SECRET_KEY is not configured in production environment!");
    return {
      success: false,
      reason: "reCAPTCHA server configuration error",
    };
  }

  // Allow explicit bypass only when explicitly enabled in non-production test suites
  if (process.env.RECAPTCHA_BYPASS === "true" && !isProd) {
    return {
      success: true,
      score: 0.9,
      action: expectedAction,
      hostname: "localhost",
      challenge_ts: new Date().toISOString(),
    };
  }

  // 4. Verify against Google siteverify
  try {
    const params = new URLSearchParams();
    params.append("secret", secretKey);
    params.append("response", rawToken);
    if (clientIp) {
      params.append("remoteip", clientIp);
    }

    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      return {
        success: false,
        reason: `Google verification endpoint returned HTTP status ${response.status}`,
      };
    }

    const data: any = await response.json();

    // 5. Google verification success check
    if (!data.success) {
      const errorCodes = Array.isArray(data["error-codes"]) ? data["error-codes"] : [];
      return {
        success: false,
        errorCodes,
        reason: `Google reCAPTCHA verification failed: ${errorCodes.join(", ") || "invalid response"}`,
      };
    }

    // 6. Token freshness check (2-3 minutes max)
    if (data.challenge_ts) {
      const challengeTime = new Date(data.challenge_ts).getTime();
      if (!isNaN(challengeTime) && Date.now() - challengeTime > 3 * 60 * 1000) {
        return {
          success: false,
          challenge_ts: data.challenge_ts,
          reason: "reCAPTCHA token has expired",
        };
      }
    }

    // 7. Hostname validation
    const allowedHostnames = options?.allowedHostnames ||
      (process.env.RECAPTCHA_ALLOWED_HOSTNAMES
        ? process.env.RECAPTCHA_ALLOWED_HOSTNAMES.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)
        : []);

    if (allowedHostnames.length > 0) {
      const tokenHost = (data.hostname || "").toLowerCase();
      // 'testkey.google.com' is Google's hostname when using Google's official test keys
      const isTestHost = tokenHost === "testkey.google.com" || allowedHostnames.includes("testkey.google.com");
      if (!allowedHostnames.includes(tokenHost) && !isTestHost) {
        return {
          success: false,
          hostname: tokenHost,
          reason: `reCAPTCHA hostname '${tokenHost}' is not in approved hostnames [${allowedHostnames.join(", ")}]`,
        };
      }
    }

    // 8. Action validation
    if (expectedAction && data.action && data.action !== expectedAction) {
      return {
        success: false,
        action: data.action,
        reason: `reCAPTCHA action mismatch: expected '${expectedAction}', received '${data.action}'`,
      };
    }

    // 9. Score validation
    const minScore = options?.minScore ?? parseFloat(process.env.RECAPTCHA_MIN_SCORE || "0.5");
    if (typeof data.score === "number" && data.score < minScore) {
      return {
        success: false,
        score: data.score,
        reason: `reCAPTCHA score (${data.score}) is below required threshold (${minScore})`,
      };
    }

    return {
      success: true,
      score: data.score,
      action: data.action,
      hostname: data.hostname,
      challenge_ts: data.challenge_ts,
    };
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return {
        success: false,
        reason: "Google reCAPTCHA verification request timed out",
      };
    }
    return {
      success: false,
      reason: `Google reCAPTCHA verification network error: ${err.message || String(err)}`,
    };
  }
}

/**
 * Express middleware to verify reCAPTCHA v3 on protected routes.
 *
 * Checks for token in:
 * 1. Request header 'x-recaptcha-token'
 * 2. Request body 'recaptchaToken'
 * 3. Request body 'captchaToken'
 */
export function verifyRecaptcha(expectedAction: string, options?: { minScore?: number }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token =
        (req.headers["x-recaptcha-token"] as string | undefined) ||
        req.body?.recaptchaToken ||
        req.body?.captchaToken;

      const clientIp =
        ((req.headers?.["x-forwarded-for"] as string) || "").split(",")[0]?.trim() ||
        req.ip ||
        req.socket?.remoteAddress;

      const result = await verifyRecaptchaToken(token, expectedAction, clientIp, options);

      if (!result.success) {
        console.warn(
          `[reCAPTCHA Blocked] Action: '${expectedAction}', IP: '${clientIp}', Reason: ${result.reason}`
        );
        res.status(400).json({
          error: "recaptcha_failed",
          message: "Security verification failed. Please refresh the page and try again.",
          details: process.env.NODE_ENV !== "production" ? result.reason : undefined,
        });
        return;
      }

      // Store verification result on request object for auditing
      (req as any).recaptcha = result;
      next();
    } catch (error: any) {
      console.error("[reCAPTCHA Middleware Unexpected Error]:", error);
      res.status(500).json({
        error: "recaptcha_error",
        message: "Unable to complete security check at this time. Please try again.",
      });
    }
  };
}
