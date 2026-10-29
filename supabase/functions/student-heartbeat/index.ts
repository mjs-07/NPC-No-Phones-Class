
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1";

const GRACE_PERIOD_MS = 5000;

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
      const cutoffIso = new Date(
        now.getTime() - GRACE_PERIOD_MS
      ).toISOString();

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

      if (!["ACTIVE", "PAUSED"].includes(participant.status)) {
        return Response.json(
          {
            error: "Participation is no longer active",
            logout_reason: "ALREADY_LOGGED_OUT",
          },
          { status: 409 }
        );
      }

      // An approved pause is not treated as a tab-switch violation.
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

      // If the hidden interval has already exceeded five seconds,
      // returning or sending another heartbeat cannot cancel it.
      const overdue =
        participant.hidden_at !== null &&
        new Date(participant.hidden_at).getTime() <=
          now.getTime() - GRACE_PERIOD_MS;

      if (overdue) {
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
          return Response.json(
            {
              success: true,
              status: "LOGGED_OUT",
              logout_reason: "TAB_SWITCH",
            },
            { status: 200 }
          );
        }

        // Another server operation may have changed the status first.
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

      if (action === "hidden") {
        // Record the first hidden event; repeated events must not
        // restart the student's grace-period timer.
        if (participant.hidden_at === null) {
          const { error } = await ctx.supabaseAdmin
            .from("session_participants")
            .update({
              hidden_at: nowIso,
              last_seen: nowIso,
            })
            .eq("id", participant.id)
            .eq("student_id", student.id)
            .eq("status", "ACTIVE")
            .is("hidden_at", null);

          if (error) {
            console.error("Hidden event update failed:", error);

            return Response.json(
              { error: "Unable to record hidden event" },
              { status: 500 }
            );
          }
        }

        return Response.json({
          success: true,
          status: "ACTIVE",
          hidden: true,
        });
      }

      if (action === "visible") {
        // Returning within the grace period clears the hidden marker.
        const { error } = await ctx.supabaseAdmin
          .from("session_participants")
          .update({
            hidden_at: null,
            last_seen: nowIso,
          })
          .eq("id", participant.id)
          .eq("student_id", student.id)
          .eq("status", "ACTIVE");

        if (error) {
          console.error("Visible event update failed:", error);

          return Response.json(
            { error: "Unable to record visible event" },
            { status: 500 }
          );
        }

        return Response.json({
          success: true,
          status: "ACTIVE",
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
