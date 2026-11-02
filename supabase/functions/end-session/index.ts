import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

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

      // Fetch session metadata and verify ownership before ending it.
      const { data: session, error: sessionLookupError } =
        await ctx.supabaseAdmin
          .from("sessions")
          .select("id, faculty_id, session_name, started_at, ended_at")
          .eq("id", sessionId)
          .eq("faculty_id", faculty.id)
          .maybeSingle();

      if (sessionLookupError) {
        console.error("Session lookup failed:", sessionLookupError);
        return Response.json(
          { error: "Unable to load session details" },
          { status: 500 }
        );
      }

      if (!session) {
        return Response.json(
          { error: "Session not found or access denied" },
          { status: 404 }
        );
      }

      // Atomically end the session and log out active/paused participants.
      const { data: endResult, error: endError } =
        await ctx.supabaseAdmin.rpc(
          "end_classroom_session",
          {
            p_session_id: sessionId,
            p_faculty_id: faculty.id,
          }
        );

      if (endError) {
        console.error("End session failed:", endError);
        return Response.json(
          {
            error:
              endError.message ||
              "Unable to end classroom session",
          },
          { status: 409 }
        );
      }

      // Fetch final participant records after the session-ending RPC.
      const { data: participants, error: participantsError } =
        await ctx.supabaseAdmin
          .from("session_participants")
          .select(
            "id, student_id, login_at, logout_at, status, logout_reason, total_paused_seconds"
          )
          .eq("session_id", sessionId)
          .order("login_at", { ascending: true });

      if (participantsError) {
        console.error(
          "Attendance fetch failed:",
          participantsError
        );
        return Response.json(
          {
            error:
              "Session ended, but attendance data could not be loaded. Please retry the report.",
          },
          { status: 500 }
        );
      }

      const studentIds = [
        ...new Set(
          (participants || []).map((p) => p.student_id)
        ),
      ];

      let studentsById = new Map();

      if (studentIds.length > 0) {
        const { data: students, error: studentsError } =
          await ctx.supabaseAdmin
            .from("students")
            .select("id, name, roll_number")
            .in("id", studentIds);

        if (studentsError) {
          console.error(
            "Student details fetch failed:",
            studentsError
          );
          return Response.json(
            {
              error:
                "Session ended, but student details could not be loaded. Please retry the report.",
            },
            { status: 500 }
          );
        }

        studentsById = new Map(
          (students || []).map((student) => [
            student.id,
            student,
          ])
        );
      }

      const attendance = (participants || []).map((p) => {
        const student = studentsById.get(p.student_id);

        return {
          student_name: student?.name ?? "",
          roll_number: student?.roll_number ?? "",
          login_at: p.login_at,
          logout_at: p.logout_at,
          status: p.status,
          logout_reason: p.logout_reason ?? "",
          total_paused_seconds:
            p.total_paused_seconds ?? 0,
        };
      });

      return Response.json(
        {
          message: "Classroom session ended successfully.",
          result: endResult,
          session: {
            id: session.id,
            session_name: session.session_name,
            started_at: session.started_at,
          },
          attendance,
        },
        { status: 200 }
      );
    }
  ),
};