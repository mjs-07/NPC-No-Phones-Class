//student-heartbeat/index.ts
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1";

const GRACE_PERIOD_MS = 5000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

      let body: {
        session_id?: string;
        participant_id?: string;
        action?: "heartbeat" | "hidden" | "visible";
      };

      try {
        body = await req.json();
      } catch {
        return Response.json(
          { error: "Invalid request body" },
          { status: 400 }
        );
      }

      const { session_id, participant_id } = body;
      const action = body.action ?? "heartbeat";

      if (!session_id || !participant_id) {
        return Response.json(
          {
            error: "session_id and participant_id are required",
          },
          { status: 400 }
        );
      }

      if (!["heartbeat", "hidden", "visible"].includes(action)) {
        return Response.json(
          { error: "Invalid action" },
          { status: 400 }
        );
      }

      const now = new Date();
      const nowIso = now.toISOString();

      // Resolve the authenticated student's profile.
      const { data: student, error: studentError } =
        await ctx.supabaseAdmin
          .from("students")
          .select("id")
          .eq("auth_user_id", userId)
          .maybeSingle();

      if (studentError) {
        console.error("Student lookup failed:", studentError);

        return Response.json(
          { error: "Unable to verify student account" },
          { status: 500 }
        );
      }

      if (!student) {
        return Response.json(
          { error: "Student access required" },
          { status: 403 }
        );
      }

      // Verify ownership of this participation record.
      const { data: participant, error: participantError } =
        await ctx.supabaseAdmin
          .from("session_participants")
          .select(
            "id, session_id, status, hidden_at, pause_expires_at"
          )
          .eq("id", participant_id)
          .eq("session_id", session_id)
          .eq("student_id", student.id)
          .maybeSingle();

      if (participantError) {
        console.error(
          "Participant lookup failed:",
          participantError
        );

        return Response.json(
          { error: "Unable to verify participation" },
          { status: 500 }
        );
      }

      if (!participant) {
        return Response.json(
          { error: "Participation not found" },
          { status: 404 }
        );
      }

      // Read the classroom-level pause state before processing any
      // visibility event. A faculty-wide pause must never trigger
      // tab-switch logout for a student.
      const { data: classroom, error: classroomError } =
        await ctx.supabaseAdmin
          .from("sessions")
          .select("status, faculty_paused")
          .eq("id", session_id)
          .maybeSingle();

      if (classroomError) {
        console.error("Classroom state lookup failed:", classroomError);

        return Response.json(
          { error: "Unable to verify classroom state" },
          { status: 500 }
        );
      }

      if (!classroom || classroom.status !== "ACTIVE") {
        return Response.json(
          { error: "Classroom session is no longer active", status: "SESSION_ENDED" },
          { status: 409 }
        );
      }

      if (!["ACTIVE", "PAUSED"].includes(participant.status)) {
        return Response.json(
          {
            error: "Participation is no longer active",
            status: participant.status,
            logout_reason: "ALREADY_LOGGED_OUT",
          },
          { status: 409 }
        );
      }

      // Faculty-wide pause takes precedence over all student visibility
      // events. Keep the participation alive and do not inspect hidden_at.
      if (classroom.faculty_paused === true) {
        const { error: pausedHeartbeatError } =
          await ctx.supabaseAdmin
            .from("session_participants")
            .update({ last_seen: nowIso })
            .eq("id", participant.id)
            .eq("student_id", student.id)
            .in("status", ["ACTIVE", "PAUSED"]);

        if (pausedHeartbeatError) {
          console.error(
            "Faculty-paused heartbeat update failed:",
            pausedHeartbeatError
          );

          return Response.json(
            { error: "Unable to record heartbeat during classroom pause" },
            { status: 500 }
          );
        }

        return Response.json({
          success: true,
          participant_id: participant.id,
          status: participant.status,
          faculty_paused: true,
        });
      }

      // Approved pause is not treated as a tab-switch violation.
      if (participant.status === "PAUSED") {
        const { error } = await ctx.supabaseAdmin
          .from("session_participants")
          .update({ last_seen: nowIso })
          .eq("id", participant.id)
          .eq("student_id", student.id)
          .eq("status", "PAUSED");

        if (error) {
          console.error("Paused heartbeat failed:", error);

          return Response.json(
            { error: "Unable to record heartbeat" },
            { status: 500 }
          );
        }

        return Response.json({
          success: true,
          participant_id: participant.id,
          status: "PAUSED",
        });
      }

      // If already hidden for more than five seconds,
      // this request cannot cancel the timeout.
      const overdue =
        participant.hidden_at !== null &&
        new Date(participant.hidden_at).getTime() <=
          now.getTime() - GRACE_PERIOD_MS;

      if (overdue) {
        const cutoffIso = new Date(
          now.getTime() - GRACE_PERIOD_MS
        ).toISOString();

        const { data: loggedOut, error } =
          await ctx.supabaseAdmin
            .from("session_participants")
            .update({
              status: "LOGGED_OUT",
              logout_at: nowIso,
              logout_reason: "TAB_SWITCH",
            })
            .eq("id", participant.id)
            .eq("student_id", student.id)
            .eq("status", "ACTIVE")
            .lte("hidden_at", cutoffIso)
            .select("id")
            .maybeSingle();

        if (error) {
          console.error("Tab-switch logout failed:", error);

          return Response.json(
            { error: "Unable to process tab-switch logout" },
            { status: 500 }
          );
        }

        if (loggedOut) {
          return Response.json({
            success: true,
            status: "LOGGED_OUT",
            logout_reason: "TAB_SWITCH",
          });
        }

        const { data: latest, error: latestError } =
          await ctx.supabaseAdmin
            .from("session_participants")
            .select("status, logout_reason")
            .eq("id", participant.id)
            .maybeSingle();

        if (latestError) {
          return Response.json(
            { error: "Unable to verify current participation" },
            { status: 500 }
          );
        }

        return Response.json(
          {
            error: "Participation is no longer active",
            status: latest?.status ?? "UNKNOWN",
            logout_reason: latest?.logout_reason ?? null,
          },
          { status: 409 }
        );
      }

      // --------------------------------------------------
      // HIDDEN: record hidden_at, wait five seconds on the
      // server, then independently enforce TAB_SWITCH.
      // --------------------------------------------------
      if (action === "hidden") {
        let hiddenAt = participant.hidden_at;

        // Record only the first hidden event.
        if (hiddenAt === null) {
          const { data: updated, error } =
            await ctx.supabaseAdmin
              .from("session_participants")
              .update({
                hidden_at: nowIso,
                last_seen: nowIso,
              })
              .eq("id", participant.id)
              .eq("student_id", student.id)
              .eq("status", "ACTIVE")
              .is("hidden_at", null)
              .select("hidden_at")
              .maybeSingle();

          if (error) {
            console.error("Hidden event update failed:", error);

            return Response.json(
              { error: "Unable to record hidden event" },
              { status: 500 }
            );
          }

          if (!updated) {
            // Another event may have changed the participant.
            const { data: latest, error: latestError } =
              await ctx.supabaseAdmin
                .from("session_participants")
                .select("status, hidden_at, logout_reason")
                .eq("id", participant.id)
                .maybeSingle();

            if (latestError) {
              return Response.json(
                { error: "Unable to verify hidden state" },
                { status: 500 }
              );
            }

            if (latest?.status !== "ACTIVE") {
              return Response.json(
                {
                  success: false,
                  status: latest?.status ?? "UNKNOWN",
                  logout_reason: latest?.logout_reason ?? null,
                },
                { status: 409 }
              );
            }

            hiddenAt = latest?.hidden_at ?? null;
          } else {
            hiddenAt = updated.hidden_at;
          }
        }

        if (!hiddenAt) {
          return Response.json({
            success: true,
            status: "ACTIVE",
            hidden: true,
          });
        }

        // Server-side grace period. This does not depend on
        // the student returning to the dashboard.
        const hiddenTimestamp = new Date(hiddenAt).getTime();
        const elapsed = Date.now() - hiddenTimestamp;
        const remaining = Math.max(
          0,
          GRACE_PERIOD_MS - elapsed
        );

        if (remaining > 0) {
          await delay(remaining);
        }

        // The faculty may have paused the classroom while this request
        // was waiting. Re-check before enforcing logout.
        const { data: latestClassroom, error: latestClassroomError } =
          await ctx.supabaseAdmin
            .from("sessions")
            .select("status, faculty_paused")
            .eq("id", session_id)
            .maybeSingle();

        if (latestClassroomError) {
          console.error(
            "Classroom re-check failed after grace period:",
            latestClassroomError
          );

          return Response.json(
            { error: "Unable to re-check classroom state" },
            { status: 500 }
          );
        }

        if (
          !latestClassroom ||
          latestClassroom.status !== "ACTIVE" ||
          latestClassroom.faculty_paused === true
        ) {
          return Response.json({
            success: true,
            status: participant.status,
            faculty_paused: latestClassroom?.faculty_paused === true,
            hidden: false,
          });
        }

        const enforcementTime = new Date();
        const enforcementIso = enforcementTime.toISOString();
        const cutoffIso = new Date(
          enforcementTime.getTime() - GRACE_PERIOD_MS
        ).toISOString();

        /*
         * Logout only if:
         * - still ACTIVE
         * - hidden_at is still the same hidden event
         * - hidden_at is at least five seconds old
         *
         * If a visible event cleared hidden_at, this update
         * will not match.
         */
        const { data: loggedOut, error: logoutError } =
          await ctx.supabaseAdmin
            .from("session_participants")
            .update({
              status: "LOGGED_OUT",
              logout_at: enforcementIso,
              logout_reason: "TAB_SWITCH",
            })
            .eq("id", participant.id)
            .eq("session_id", session_id)
            .eq("student_id", student.id)
            .eq("status", "ACTIVE")
            .eq("hidden_at", hiddenAt)
            .lte("hidden_at", cutoffIso)
            .select("id")
            .maybeSingle();

        if (logoutError) {
          console.error(
            "Delayed tab-switch enforcement failed:",
            logoutError
          );

          return Response.json(
            { error: "Unable to enforce tab-switch timeout" },
            { status: 500 }
          );
        }

        if (loggedOut) {
          return Response.json({
            success: true,
            status: "LOGGED_OUT",
            logout_reason: "TAB_SWITCH",
          });
        }

        // The student may have returned, been paused,
        // or logged out by another server operation.
        const { data: latest, error: latestError } =
          await ctx.supabaseAdmin
            .from("session_participants")
            .select("status, hidden_at, logout_reason")
            .eq("id", participant.id)
            .maybeSingle();

        if (latestError) {
          return Response.json(
            { error: "Unable to verify participation after grace period" },
            { status: 500 }
          );
        }

        return Response.json({
          success: true,
          status: latest?.status ?? "UNKNOWN",
          hidden: latest?.hidden_at !== null,
          logout_reason: latest?.logout_reason ?? null,
        });
      }

      // --------------------------------------------------
      // VISIBLE: returning within five seconds clears the
      // hidden marker. An overdue marker cannot be cleared.
      // --------------------------------------------------
      if (action === "visible") {
        const { data: updated, error } =
          await ctx.supabaseAdmin
            .from("session_participants")
            .update({
              hidden_at: null,
              last_seen: nowIso,
            })
            .eq("id", participant.id)
            .eq("student_id", student.id)
            .eq("status", "ACTIVE")
            .not("hidden_at", "is", null)
            .gt("hidden_at", new Date(
              now.getTime() - GRACE_PERIOD_MS
            ).toISOString())
            .select("id")
            .maybeSingle();

        if (error) {
          console.error("Visible event update failed:", error);

          return Response.json(
            { error: "Unable to record visible event" },
            { status: 500 }
          );
        }

        // If no hidden marker existed, record the heartbeat.
        if (!updated && participant.hidden_at === null) {
          await ctx.supabaseAdmin
            .from("session_participants")
            .update({ last_seen: nowIso })
            .eq("id", participant.id)
            .eq("student_id", student.id)
            .eq("status", "ACTIVE")
            .is("hidden_at", null);
        }

        return Response.json({
          success: true,
          status: updated ? "ACTIVE" : "CHECKING",
          hidden: false,
        });
      }

      // Regular heartbeat: do not clear hidden_at implicitly.
      const { error: updateError } =
        await ctx.supabaseAdmin
          .from("session_participants")
          .update({ last_seen: nowIso })
          .eq("id", participant.id)
          .eq("student_id", student.id)
          .eq("status", "ACTIVE")
          .is("hidden_at", null);

      if (updateError) {
        console.error("Heartbeat update failed:", updateError);

        return Response.json(
          { error: "Unable to record heartbeat" },
          { status: 500 }
        );
      }

      return Response.json({
        success: true,
        participant_id: participant.id,
        status: "ACTIVE",
      });
    }
  ),
};