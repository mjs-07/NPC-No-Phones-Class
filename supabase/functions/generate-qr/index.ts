import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const QR_INTERVAL_SECONDS = 20;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createHmacSignature(
  secret: string,
  message: string
): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  );

  return bytesToHex(new Uint8Array(signature));
}

export default {
  fetch: withSupabase(
    { auth: "user" },
    async (req, ctx) => {
      if (req.method !== "POST") {
        return Response.json(
          { error: "Method not allowed" },
          { status: 405 }
        );
      }

      const userId = ctx.userClaims?.id;

      if (!userId) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }

      let body: { session_id?: string };

      try {
        body = await req.json();
      } catch {
        return Response.json(
          { error: "Invalid request body" },
          { status: 400 }
        );
      }

      const sessionId = body.session_id;

      if (!sessionId) {
        return Response.json(
          { error: "session_id is required" },
          { status: 400 }
        );
      }

      // Verify that the authenticated user is a faculty member.
      const { data: faculty, error: facultyError } =
        await ctx.supabaseAdmin
          .from("faculties")
          .select("id")
          .eq("auth_user_id", userId)
          .maybeSingle();

      if (facultyError) {
        console.error("Faculty lookup failed:", facultyError);

        return Response.json(
          { error: "Unable to verify faculty account" },
          { status: 500 }
        );
      }

      if (!faculty) {
        return Response.json(
          { error: "Faculty access required" },
          { status: 403 }
        );
      }

      // Verify that this session belongs to the authenticated faculty
      // and is currently active.
      const { data: session, error: sessionError } =
        await ctx.supabaseAdmin
          .from("sessions")
          .select("id, faculty_id, status")
          .eq("id", sessionId)
          .eq("faculty_id", faculty.id)
          .maybeSingle();

      if (sessionError) {
        console.error("Session lookup failed:", sessionError);

        return Response.json(
          { error: "Unable to verify classroom session" },
          { status: 500 }
        );
      }

      if (!session) {
        return Response.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }

      if (session.status !== "ACTIVE") {
        return Response.json(
          { error: "Classroom session is not active" },
          { status: 409 }
        );
      }

      const secret = Deno.env.get("QR_HMAC_SECRET");

      if (!secret) {
        console.error("QR_HMAC_SECRET is not configured");

        return Response.json(
          { error: "QR signing service is not configured" },
          { status: 500 }
        );
      }

      // Divide time into fixed 20-second buckets.
      const currentTimeSeconds = Math.floor(Date.now() / 1000);
      const timeBucket = Math.floor(
        currentTimeSeconds / QR_INTERVAL_SECONDS
      );

      // The session ID and time bucket are what the server signs.
      const message = `${session.id}:${timeBucket}`;

      const signature = await createHmacSignature(
        secret,
        message
      );

      // The secret itself is never included in the QR token.
      const token = `${session.id}.${timeBucket}.${signature}`;

      const expiresAt =
        (timeBucket + 1) * QR_INTERVAL_SECONDS;

      return Response.json({
        token,
        session_id: session.id,
        time_bucket: timeBucket,
        expires_at: new Date(
          expiresAt * 1000
        ).toISOString(),
      });
    }
  ),
};