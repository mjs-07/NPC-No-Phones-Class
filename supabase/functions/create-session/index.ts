import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase(
    { auth: "user" },
    async (req, ctx) => {
      // Only POST requests are allowed
      if (req.method !== "POST") {
        return Response.json(
          { error: "Method not allowed" },
          { status: 405 }
        );
      }

      // Get the authenticated user's ID from the verified JWT
      const userId = ctx.userClaims?.id;

      if (!userId) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }

      // Read and validate the session name
      let sessionName: string;

      try {
        const body = await req.json();
        sessionName =
          typeof body?.session_name === "string"
            ? body.session_name.trim()
            : "";
      } catch {
        return Response.json(
          { error: "Invalid request body" },
          { status: 400 }
        );
      }

      if (!sessionName) {
        return Response.json(
          { error: "Session name is required." },
          { status: 400 }
        );
      }

      if (sessionName.length > 80) {
        return Response.json(
          { error: "Session name must be 80 characters or fewer." },
          { status: 400 }
        );
      }

      // Look up faculty profile using the server-side admin client
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

      // Check whether this faculty already has an active session
      const { data: existingSession, error: existingError } =
        await ctx.supabaseAdmin
          .from("sessions")
          .select(
            "id, status, started_at, ended_at, session_name"
          )
          .eq("faculty_id", faculty.id)
          .eq("status", "ACTIVE")
          .maybeSingle();

      if (existingError) {
        console.error("Active session lookup failed:", existingError);

        return Response.json(
          { error: "Unable to check active session" },
          { status: 500 }
        );
      }

      if (existingSession) {
        return Response.json(
          {
            error: "An active classroom session already exists.",
            session: existingSession,
          },
          { status: 409 }
        );
      }

      // Create session with the submitted name
      const { data: session, error: insertError } =
        await ctx.supabaseAdmin
          .from("sessions")
          .insert({
            faculty_id: faculty.id,
            session_name: sessionName,
          })
          .select(
            "id, faculty_id, session_name, status, started_at, ended_at, created_at"
          )
          .single();

      if (insertError) {
        console.error("Session creation failed:", insertError);

        // PostgreSQL unique-constraint violation
        if (insertError.code === "23505") {
          return Response.json(
            { error: "An active classroom session already exists." },
            { status: 409 }
          );
        }

        return Response.json(
          { error: "Unable to create classroom session" },
          { status: 500 }
        );
      }

      return Response.json(
        {
          message: "Classroom session started successfully.",
          session,
        },
        { status: 201 }
      );
    }
  ),
};