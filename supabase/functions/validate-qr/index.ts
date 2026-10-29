import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const QR_INTERVAL_SECONDS = 20;
const QR_PREVIOUS_BUCKET_GRACE_SECONDS = 3;

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    return null;
  }

  if (hex.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(
      hex.slice(i, i + 2),
      16
    );
  }

  return bytes;
}

async function verifyHmacSignature(
  secret: string,
  message: string,
  signatureHex: string
): Promise<boolean> {
  const signatureBytes =
    hexToBytes(signatureHex);

  if (!signatureBytes) {
    return false;
  }

  const encoder = new TextEncoder();

  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["verify"]
    );

  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder.encode(message)
  );
}

function parseQrToken(token: string) {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [
    sessionId,
    bucketString,
    signature,
  ] = parts;

  if (
    !sessionId ||
    !bucketString ||
    !signature
  ) {
    return null;
  }

  const timeBucket =
    Number(bucketString);

  if (
    !Number.isSafeInteger(timeBucket) ||
    timeBucket < 0
  ) {
    return null;
  }

  return {
    sessionId,
    timeBucket,
    signature,
  };
}

export default {
  fetch: withSupabase(
    { auth: "user" },
    async (req, ctx) => {
      /*
       * ------------------------------------------------------------
       * METHOD
       * ------------------------------------------------------------
       */

      if (req.method !== "POST") {
        return Response.json(
          {
            error: "Method not allowed",
          },
          {
            status: 405,
          }
        );
      }

      /*
       * ------------------------------------------------------------
       * AUTHENTICATED USER
       * ------------------------------------------------------------
       */

      const userId =
        ctx.userClaims?.id;

      if (!userId) {
        return Response.json(
          {
            error: "Unauthorized",
          },
          {
            status: 401,
          }
        );
      }

      /*
       * ------------------------------------------------------------
       * REQUEST BODY
       * ------------------------------------------------------------
       */

      let body: {
        token?: string;
      };

      try {
        body = await req.json();
      } catch {
        return Response.json(
          {
            error:
              "Invalid request body",
          },
          {
            status: 400,
          }
        );
      }

      const token =
        typeof body.token === "string"
          ? body.token.trim()
          : "";

      if (!token) {
        return Response.json(
          {
            error:
              "QR token is required.",
          },
          {
            status: 400,
          }
        );
      }

      /*
       * ------------------------------------------------------------
       * PARSE QR TOKEN
       *
       * Expected format:
       *
       * sessionId.timeBucket.signature
       * ------------------------------------------------------------
       */

      const parsedToken =
        parseQrToken(token);

      if (!parsedToken) {
        return Response.json(
          {
            error:
              "Invalid QR token format.",
          },
          {
            status: 400,
          }
        );
      }

      const {
        sessionId,
        timeBucket,
        signature,
      } = parsedToken;

      /*
       * ------------------------------------------------------------
       * FIND STUDENT
       * ------------------------------------------------------------
       */

      const {
        data: student,
        error: studentError,
      } = await ctx.supabaseAdmin
        .from("students")
        .select(
          "id, name, roll_number, email"
        )
        .eq(
          "auth_user_id",
          userId
        )
        .maybeSingle();

      if (studentError) {
        console.error(
          "Student lookup failed:",
          studentError
        );

        return Response.json(
          {
            error:
              "Unable to verify student account.",
          },
          {
            status: 500,
          }
        );
      }

      if (!student) {
        return Response.json(
          {
            error:
              "Student profile not found.",
          },
          {
            status: 403,
          }
        );
      }

      /*
       * ------------------------------------------------------------
       * QR SECRET
       * ------------------------------------------------------------
       */

      const secret =
        Deno.env.get(
          "QR_HMAC_SECRET"
        );

      if (!secret) {
        console.error(
          "QR_HMAC_SECRET is not configured."
        );

        return Response.json(
          {
            error:
              "QR validation service is not configured.",
          },
          {
            status: 500,
          }
        );
      }

      /*
       * ------------------------------------------------------------
       * FIND ACTIVE SESSION
       * ------------------------------------------------------------
       */

      const {
        data: session,
        error: sessionError,
      } = await ctx.supabaseAdmin
        .from("sessions")
        .select(
          "id, status, started_at, ended_at, qr_started_at"
        )
        .eq("id", sessionId)
        .maybeSingle();

      if (sessionError) {
        console.error(
          "Session lookup failed:",
          sessionError
        );

        return Response.json(
          {
            error:
              "Unable to verify classroom session.",
          },
          {
            status: 500,
          }
        );
      }

      if (!session) {
        return Response.json(
          {
            error:
              "Classroom session not found.",
          },
          {
            status: 404,
          }
        );
      }

      if (session.status !== "ACTIVE") {
        return Response.json(
          {
            error:
              "This classroom session is no longer active.",
          },
          {
            status: 409,
          }
        );
      }

      if (!session.qr_started_at) {
        return Response.json(
          {
            error:
              "QR session has not been initialized yet.",
          },
          {
            status: 409,
          }
        );
      }

      /*
       * ------------------------------------------------------------
       * VALIDATE HMAC
       *
       * The browser does NOT know QR_HMAC_SECRET.
       *
       * We recreate:
       *
       * sessionId:timeBucket
       *
       * and verify the supplied signature.
       * ------------------------------------------------------------
       */

      const signedMessage =
        `${sessionId}:${timeBucket}`;

      const signatureValid =
        await verifyHmacSignature(
          secret,
          signedMessage,
          signature
        );

      if (!signatureValid) {
        return Response.json(
          {
            error:
              "Invalid QR code.",
          },
          {
            status: 401,
          }
        );
      }

      /*
       * ------------------------------------------------------------
       * VALIDATE QR TIME WINDOW
       * ------------------------------------------------------------
       *
       * The QR timeline is anchored to:
       *
       * session.qr_started_at
       *
       * Each bucket = 20 seconds.
       *
       * Normally only the CURRENT bucket is valid.
       *
       * The immediately previous bucket receives
       * a maximum 3-second grace period.
       *
       * This handles scans occurring right around
       * a QR rotation boundary.
       * ------------------------------------------------------------
       */

      const nowMs =
        Date.now();

      const qrStartedMs =
        new Date(
          session.qr_started_at
        ).getTime();

      if (
        !Number.isFinite(
          qrStartedMs
        )
      ) {
        return Response.json(
          {
            error:
              "Invalid QR session timing.",
          },
          {
            status: 500,
          }
        );
      }

      const elapsedSeconds =
        Math.max(
          0,
          Math.floor(
            (nowMs - qrStartedMs) /
              1000
          )
        );

      const currentBucket =
        Math.floor(
          elapsedSeconds /
            QR_INTERVAL_SECONDS
        );

      /*
       * Current bucket:
       *
       * [bucket start, bucket end)
       */

      if (
        timeBucket ===
        currentBucket
      ) {
        // Valid current QR.
      } else if (
        timeBucket ===
          currentBucket - 1
      ) {
        /*
         * Previous QR is only accepted during
         * the first 3 seconds after its expiry.
         */

        const currentBucketStartedMs =
          qrStartedMs +
          currentBucket *
            QR_INTERVAL_SECONDS *
            1000;

        const secondsIntoCurrentBucket =
          (
            nowMs -
            currentBucketStartedMs
          ) / 1000;

        const secondsSincePreviousExpiry =
          Math.max(
            0,
            secondsIntoCurrentBucket
          );

        if (
          secondsSincePreviousExpiry >
          QR_PREVIOUS_BUCKET_GRACE_SECONDS
        ) {
          return Response.json(
            {
              error:
                "QR code has expired.",
            },
            {
              status: 401,
            }
          );
        }
      } else {
        return Response.json(
          {
            error:
              "QR code is not currently valid.",
          },
          {
            status: 401,
          }
        );
      }

      /*
       * ------------------------------------------------------------
       * CHECK EXISTING PARTICIPATION
       * ------------------------------------------------------------
       */

      const {
        data: existingParticipant,
        error: participantLookupError,
      } = await ctx.supabaseAdmin
        .from(
          "session_participants"
        )
        .select(
          "id, status, login_at, logout_at, logout_reason"
        )
        .eq(
          "session_id",
          session.id
        )
        .eq(
          "student_id",
          student.id
        )
        .maybeSingle();

      if (participantLookupError) {
        console.error(
          "Participant lookup failed:",
          participantLookupError
        );

        return Response.json(
          {
            error:
              "Unable to verify session participation.",
          },
          {
            status: 500,
          }
        );
      }

      /*
       * ------------------------------------------------------------
       * ANTI-REJOIN
       * ------------------------------------------------------------
       *
       * Once a student has a participation record,
       * they cannot create another one for the
       * same session.
       *
       * This remains true even if their status is
       * LOGGED_OUT.
       * ------------------------------------------------------------
       */

      if (existingParticipant) {
        if (
          existingParticipant.status ===
          "ACTIVE"
        ) {
          return Response.json(
            {
              error:
                "You are already participating in this session.",
              participant:
                existingParticipant,
            },
            {
              status: 409,
            }
          );
        }

        if (
          existingParticipant.status ===
          "PAUSED"
        ) {
          return Response.json(
            {
              error:
                "You are already participating in this session and are currently paused.",
              participant:
                existingParticipant,
            },
            {
              status: 409,
            }
          );
        }

        return Response.json(
          {
            error:
              "You have already left this classroom session and cannot rejoin.",
            logout_reason:
              existingParticipant.logout_reason,
          },
          {
            status: 409,
          }
        );
      }

      /*
       * ------------------------------------------------------------
       * CREATE PARTICIPATION
       * ------------------------------------------------------------
       *
       * This is the ONLY point at which the student
       * becomes ACTIVE in the classroom session.
       *
       * login_at and last_seen are server timestamps.
       * ------------------------------------------------------------
       */

      const loginAt =
        new Date(
          nowMs
        ).toISOString();

      const {
        data: participant,
        error: insertError,
      } = await ctx.supabaseAdmin
        .from(
          "session_participants"
        )
        .insert({
          session_id:
            session.id,

          student_id:
            student.id,

          login_at:
            loginAt,

          status:
            "ACTIVE",

          last_seen:
            loginAt,

          total_paused_seconds:
            0,
        })
        .select(
          "id, session_id, student_id, login_at, logout_at, status, logout_reason, paused_at, pause_expires_at, total_paused_seconds, last_seen"
        )
        .single();

      if (insertError) {
        /*
         * PostgreSQL unique index:
         *
         * UNIQUE(session_id, student_id)
         *
         * protects us against two simultaneous
         * join requests.
         */
        if (
          insertError.code ===
          "23505"
        ) {
          return Response.json(
            {
              error:
                "You have already joined this classroom session.",
            },
            {
              status: 409,
            }
          );
        }

        console.error(
          "Participant creation failed:",
          insertError
        );

        return Response.json(
          {
            error:
              "Unable to join classroom session.",
          },
          {
            status: 500,
          }
        );
      }

      /*
       * ------------------------------------------------------------
       * SUCCESS
       * ------------------------------------------------------------
       */

      return Response.json(
        {
          message:
            "Classroom session joined successfully.",

          participant: {
            id:
              participant.id,

            session_id:
              participant.session_id,

            student_id:
              participant.student_id,

            login_at:
              participant.login_at,

            status:
              participant.status,
          },
        },
        {
          status: 201,
        }
      );
    }
  ),
};