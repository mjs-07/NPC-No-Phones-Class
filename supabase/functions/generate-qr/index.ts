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

async function createQrToken(
  sessionId: string,
  timeBucket: number,
  secret: string
): Promise<string> {
  const message = `${sessionId}:${timeBucket}`;

  const signature = await createHmacSignature(
    secret,
    message
  );

  return `${sessionId}.${timeBucket}.${signature}`;
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

      // --------------------------------------------------
      // Verify faculty
      // --------------------------------------------------

      const { data: faculty, error: facultyError } =
        await ctx.supabaseAdmin
          .from("faculties")
          .select("id")
          .eq("auth_user_id", userId)
          .maybeSingle();

      if (facultyError) {
        console.error(
          "Faculty lookup failed:",
          facultyError
        );

        return Response.json(
          {
            error:
              "Unable to verify faculty account",
          },
          { status: 500 }
        );
      }

      if (!faculty) {
        return Response.json(
          { error: "Faculty access required" },
          { status: 403 }
        );
      }

      // --------------------------------------------------
      // Verify session ownership and status
      // --------------------------------------------------

      const { data: session, error: sessionError } =
        await ctx.supabaseAdmin
          .from("sessions")
          .select(
            "id, faculty_id, status, qr_started_at"
          )
          .eq("id", sessionId)
          .eq("faculty_id", faculty.id)
          .maybeSingle();

      if (sessionError) {
        console.error(
          "Session lookup failed:",
          sessionError
        );

        return Response.json(
          {
            error:
              "Unable to verify classroom session",
          },
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
          {
            error:
              "Classroom session is not active",
          },
          { status: 409 }
        );
      }

      // --------------------------------------------------
      // Get HMAC secret
      // --------------------------------------------------

      const secret = Deno.env.get("QR_HMAC_SECRET");

      if (!secret) {
        console.error(
          "QR_HMAC_SECRET is not configured"
        );

        return Response.json(
          {
            error:
              "QR signing service is not configured",
          },
          { status: 500 }
        );
      }

      // --------------------------------------------------
      // Establish the QR clock exactly once
      // --------------------------------------------------

      if (!session.qr_started_at) {
        /*
         * Only the first request initializes the QR clock.
         *
         * The database timestamp is used instead of the
         * browser clock.
         *
         * The WHERE condition makes initialization safe
         * if two requests arrive simultaneously.
         */
        const { error: initializeError } =
          await ctx.supabaseAdmin
            .from("sessions")
            .update({
              qr_started_at: new Date().toISOString(),
            })
            .eq("id", session.id)
            .eq("faculty_id", faculty.id)
            .is("qr_started_at", null);

        if (initializeError) {
          console.error(
            "QR clock initialization failed:",
            initializeError
          );

          return Response.json(
            {
              error:
                "Unable to initialize QR clock",
            },
            { status: 500 }
          );
        }

        /*
         * Re-read the session so we use the timestamp
         * that actually won the race.
         */
        const { data: initializedSession, error: rereadError } =
          await ctx.supabaseAdmin
            .from("sessions")
            .select("qr_started_at")
            .eq("id", session.id)
            .single();

        if (rereadError || !initializedSession?.qr_started_at) {
          console.error(
            "QR clock reread failed:",
            rereadError
          );

          return Response.json(
            {
              error:
                "Unable to initialize QR clock",
            },
            { status: 500 }
          );
        }

        session.qr_started_at =
          initializedSession.qr_started_at;
      }

      // --------------------------------------------------
      // Calculate the session-relative QR bucket
      // --------------------------------------------------

      const serverNowMs = Date.now();

      const qrStartedMs =
        new Date(
          session.qr_started_at
        ).getTime();

      const elapsedSeconds = Math.max(
        0,
        Math.floor(
          (serverNowMs - qrStartedMs) / 1000
        )
      );

      const currentBucket = Math.floor(
        elapsedSeconds /
          QR_INTERVAL_SECONDS
      );

      const nextBucket =
        currentBucket + 1;

      const currentStartsMs =
        qrStartedMs +
        currentBucket *
          QR_INTERVAL_SECONDS *
          1000;

      const currentExpiresMs =
        currentStartsMs +
        QR_INTERVAL_SECONDS * 1000;

      const nextStartsMs =
        currentExpiresMs;

      const nextExpiresMs =
        nextStartsMs +
        QR_INTERVAL_SECONDS * 1000;

      // --------------------------------------------------
      // Generate current + next signed tokens
      // --------------------------------------------------

      const currentToken =
        await createQrToken(
          session.id,
          currentBucket,
          secret
        );

      const nextToken =
        await createQrToken(
          session.id,
          nextBucket,
          secret
        );

      // --------------------------------------------------
      // Return the QR pair
      // --------------------------------------------------

      return Response.json({
        session_id: session.id,

        server_time:
          new Date(
            serverNowMs
          ).toISOString(),

        qr_started_at:
          session.qr_started_at,

        current: {
          token: currentToken,
          time_bucket: currentBucket,
          starts_at:
            new Date(
              currentStartsMs
            ).toISOString(),
          expires_at:
            new Date(
              currentExpiresMs
            ).toISOString(),
        },

        next: {
          token: nextToken,
          time_bucket: nextBucket,
          starts_at:
            new Date(
              nextStartsMs
            ).toISOString(),
          expires_at:
            new Date(
              nextExpiresMs
            ).toISOString(),
        },
      });
    }
  ),
};