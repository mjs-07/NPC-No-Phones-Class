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

      // Verify that the authenticated user is a faculty member.
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

      /*
       * The database function performs the actual
       * state transition atomically.
       */
      const { data, error } =
        await ctx.supabaseAdmin.rpc(
          "end_classroom_session",
          {
            p_session_id: sessionId,
            p_faculty_id: faculty.id,
          }
        );

      if (error) {
        console.error(
          "End session failed:",
          error
        );

        return Response.json(
          {
            error:
              error.message ||
              "Unable to end classroom session",
          },
          { status: 409 }
        );
      }

      return Response.json(
        {
          message:
            "Classroom session ended successfully.",
          result: data,
        },
        { status: 200 }
      );
    }
  ),
};