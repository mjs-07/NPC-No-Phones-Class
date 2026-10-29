import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import StudentScanner from '../../components/student/StudentScanner'

function StudentDashboard() {
  const navigate = useNavigate()

  const [student, setStudent] = useState(null)
  const [activeParticipation, setActiveParticipation] =
    useState(null)

  const [loading, setLoading] = useState(true)
  const [showScanner, setShowScanner] = useState(false)
  const [joiningSession, setJoiningSession] = useState(false)
  const [joinError, setJoinError] = useState('')


  // Serializes visibility events so a fast hide/show sequence cannot
  // send the `visible` event before the preceding `hidden` event.
  const participationEventQueue = useRef(Promise.resolve())
  const tabSwitchLockoutInProgress = useRef(false)

  const sendParticipationEvent = useCallback(
    (action, participation) => {
      if (!participation?.id || !participation?.session_id) {
        return Promise.resolve()
      }

      const send = async () => {
        try {
          const { data, error } = await supabase.functions.invoke(
            'student-heartbeat',
            {
              method: 'POST',
              body: {
                action,
                session_id: participation.session_id,
                participant_id: participation.id,
              },
            }
          )

          if (error) {
            console.error(`Student ${action} event failed:`, error)

            // The Edge Function may return HTTP 409 after the faculty
            // ends the session. Confirm the persisted state in the DB
            // instead of relying on error.context.status being present.
            // A temporary network error must not log the student out.
            const {
              data: currentParticipation,
              error: lookupError,
            } = await supabase
              .from('session_participants')
              .select('status, logout_reason')
              .eq('id', participation.id)
              .eq('session_id', participation.session_id)
              .maybeSingle()

            if (
              !lookupError &&
              currentParticipation?.status === 'LOGGED_OUT'
            ) {
              setActiveParticipation(null)
              setShowScanner(false)

              const reason = currentParticipation.logout_reason
              setJoinError(
                reason === 'SESSION_ENDED'
                  ? 'Your faculty has ended the classroom session. You are now logged out.'
                  : reason === 'TAB_SWITCH'
                    ? 'You were logged out because the classroom page was hidden for more than 5 seconds. Contact your faculty if you need assistance.'
                    : 'Your classroom participation has ended. Contact your faculty if you need assistance.'
              )
            } else if (lookupError) {
              console.error('Could not confirm participation status:', lookupError)
            }
            return
          }

          if (data?.status === 'LOGGED_OUT') {
            setActiveParticipation(null)
            setShowScanner(false)
            setJoinError(
              data.logout_reason === 'SESSION_ENDED'
                ? 'Your faculty has ended the classroom session. You are now logged out.'
                : data.logout_reason === 'TAB_SWITCH' || data.reason === 'TAB_SWITCH'
                  ? 'You were logged out because the classroom page was hidden for more than 5 seconds. Contact your faculty if you need assistance.'
                  : 'Your classroom participation has ended. Contact your faculty if you need assistance.'
            )
            return
          }

          if (data?.success === false) {
            console.warn(`Student ${action} event was not accepted:`, data)
          }
        } catch (error) {
          // Do not falsely log the student out on a transient network error.
          console.error(`Student ${action} request failed:`, error)
        }
      }

      const queuedRequest = participationEventQueue.current.then(send, send)
      participationEventQueue.current = queuedRequest.catch(() => {})
      return queuedRequest
    },
    []
  )

  // React immediately to server-side logout updates (especially when faculty
  // ends the session). Heartbeats remain as a fallback if Realtime disconnects.
  useEffect(() => {
    const participation = activeParticipation

    if (!participation?.id || !['ACTIVE', 'PAUSED'].includes(participation.status)) {
      return undefined
    }

    const channel = supabase
      .channel(`participant-status-${participation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'session_participants',
          filter: `id=eq.${participation.id}`,
        },
        (payload) => {
          const updated = payload.new
          if (updated?.status !== 'LOGGED_OUT') return

          setActiveParticipation(null)
          setShowScanner(false)
          setJoiningSession(false)

          const message = updated.logout_reason === 'SESSION_ENDED'
            ? 'Your faculty has ended the classroom session. You are now logged out.'
            : updated.logout_reason === 'TAB_SWITCH'
              ? 'You were logged out because the classroom page was hidden for more than 5 seconds. Contact your faculty if you need assistance.'
              : 'Your classroom participation has ended. Contact your faculty if you need assistance.'

          setJoinError(message)
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Participant status Realtime channel status:', status)
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [activeParticipation])

  // Report page visibility changes and send a heartbeat every 10 seconds
  // while participation is ACTIVE or PAUSED. This also detects when the
  // faculty ends the session while the student page remains open.
  useEffect(() => {
    const participation = activeParticipation

    if (
      !participation ||
      !['ACTIVE', 'PAUSED'].includes(participation.status)
    ) {
      return undefined
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void sendParticipationEvent('hidden', participation)
      } else if (document.visibilityState === 'visible') {
        void sendParticipationEvent('visible', participation)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    const heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void sendParticipationEvent('heartbeat', participation)
      }
    }, 10_000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(heartbeatTimer)
    }
  }, [activeParticipation, sendParticipationEvent])



  /*
   * ------------------------------------------------------------
   * LOAD ACTIVE PARTICIPATION
   *
   * React state is lost when the page is refreshed.
   *
   * Therefore, after loading the student profile, we query the
   * database to restore an existing ACTIVE or PAUSED participation.
   *
   * The database is the source of truth.
   * ------------------------------------------------------------
   */

  const loadActiveParticipation = useCallback(
    async (studentId) => {
      const {
        data,
        error,
      } = await supabase
        .from('session_participants')
        .select(
          `
          id,
          session_id,
          student_id,
          login_at,
          logout_at,
          status,
          logout_reason,
          paused_at,
          pause_expires_at,
          total_paused_seconds,
          last_seen,
          created_at
          `
        )
        .eq(
          'student_id',
          studentId
        )
        .in(
          'status',
          ['ACTIVE', 'PAUSED']
        )
        .order(
          'created_at',
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error(
          'Active participation lookup failed:',
          {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          }
        );

        window.alert(
          `Could not restore classroom session.\n${error.message}`
        );

        return;
      }

      console.log(
        'Active participation lookup result:',
        data
      );

      if (data) {
        console.log(
          'Existing classroom participation restored:',
          data
        )

        setActiveParticipation(data)
      } else {
        setActiveParticipation(null)
      }
    },
    []
  )

  /*
   * ------------------------------------------------------------
   * LOAD STUDENT PROFILE
   * ------------------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false

    async function loadStudentProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (cancelled) {
          return
        }

        if (!user) {
          navigate('/login', {
            replace: true,
          })

          return
        }

        const {
          data,
          error,
        } = await supabase
          .from('students')
          .select(
            'id, name, roll_number, email'
          )
          .eq(
            'auth_user_id',
            user.id
          )
          .maybeSingle()

        if (cancelled) {
          return
        }

        if (error) {
          console.error(
            'Student profile lookup failed:',
            error
          )

          setLoading(false)
          return
        }

        if (!data) {
          navigate('/login', {
            replace: true,
          })

          return
        }

        setStudent(data)

        /*
         * --------------------------------------------------------
         * RESTORE EXISTING PARTICIPATION
         *
         * This is what allows a student to refresh the browser
         * without losing their classroom participation state.
         * --------------------------------------------------------
         */

        await loadActiveParticipation(
          data.id
        )

        if (cancelled) {
          return
        }

        setLoading(false)
      } catch (error) {
        if (cancelled) {
          return
        }

        console.error(
          'Student dashboard initialization failed:',
          error
        )

        setLoading(false)
      }
    }

    loadStudentProfile()

    return () => {
      cancelled = true
    }
  }, [
    navigate,
    loadActiveParticipation,
  ])

  /*
   * ------------------------------------------------------------
   * HANDLE SUCCESSFUL QR DETECTION
   *
   * StudentScanner gives us ONLY the decoded QR token.
   *
   * The browser does NOT decide whether the student
   * has joined successfully.
   *
   * validate-qr on the server decides that.
   * ------------------------------------------------------------
   */

  const handleScanSuccess = useCallback(
    async (decodedToken) => {
      if (!decodedToken || tabSwitchLockoutInProgress.current) {
        return
      }

      setJoiningSession(true)
      setJoinError('')

      const tabSwitchMessage =
        "You can't scan again to enter the classroom because of tab switching. You will be signed out."

      const handleTabSwitchLockout = async () => {
        if (tabSwitchLockoutInProgress.current) return

        tabSwitchLockoutInProgress.current = true
        setShowScanner(false)
        setJoinError(tabSwitchMessage)

        // End the student's authenticated website session as requested.
        try {
          await supabase.auth.signOut()
        } catch (signOutError) {
          console.error('Could not sign out after tab-switch lockout:', signOutError)
        }

        // Leave the message visible briefly, then take the student to login.
        window.setTimeout(() => {
          navigate('/login', { replace: true })
        }, 2500)
      }

      try {
        const { data, error } = await supabase.functions.invoke(
          'validate-qr',
          {
            method: 'POST',
            body: { token: decodedToken },
          }
        )

        if (error) {
          console.error('QR validation failed:', error)

          // Supabase's top-level error.message is often generic. Read the
          // actual Edge Function response body for its rejection reason/code.
          let responseBody = null
          try {
            if (error.context && typeof error.context.clone === 'function') {
              responseBody = await error.context.clone().json()
            }
          } catch {
            // The response may not contain JSON; use the safe fallback below.
          }

          const responseDetails = [
            responseBody?.code,
            responseBody?.error,
            responseBody?.message,
            responseBody?.reason,
            error.message,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()

          let wasLoggedOutForTabSwitch =
            /tab.?switch|hidden.{0,30}(5|five).{0,10}second|cannot.?rejoin.{0,40}(tab|switch)|rejoin.?blocked/.test(
              responseDetails
            )

          // Some versions of the function return only a generic non-2xx
          // message. In that case, check whether this student has a very
          // recent TAB_SWITCH logout, which is the expected reason for this
          // immediate re-scan rejection.
          if (
            !wasLoggedOutForTabSwitch &&
            student?.id &&
            responseDetails.includes('non-2xx')
          ) {
            const recentCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString()
            const { data: recentTabSwitch, error: historyError } = await supabase
              .from('session_participants')
              .select('id, logout_at, logout_reason')
              .eq('student_id', student.id)
              .eq('status', 'LOGGED_OUT')
              .eq('logout_reason', 'TAB_SWITCH')
              .gte('logout_at', recentCutoff)
              .order('logout_at', { ascending: false })
              .limit(1)
              .maybeSingle()

            if (historyError) {
              console.error('Could not check recent tab-switch logout:', historyError)
            } else {
              wasLoggedOutForTabSwitch = Boolean(recentTabSwitch)
            }
          }

          if (wasLoggedOutForTabSwitch) {
            await handleTabSwitchLockout()
            return
          }

          // Keep other QR errors helpful rather than showing Supabase's
          // generic "Edge Function returned a non-2xx status code" message.
          if (responseDetails.includes('expired')) {
            setJoinError('This QR code has expired. Please scan the current classroom QR code.')
          } else if (
            responseDetails.includes('currently valid') ||
            responseDetails.includes('invalid qr')
          ) {
            setJoinError('This QR code is not valid anymore. Please scan the current classroom QR code.')
          } else if (
            responseDetails.includes('already participating') ||
            responseDetails.includes('already joined') ||
            responseDetails.includes('cannot rejoin') ||
            responseDetails.includes('cannot join again')
          ) {
            setJoinError('You cannot rejoin this classroom session. Please contact your faculty for assistance.')
          } else {
            setJoinError('We could not verify this QR code. Please scan the current classroom QR code and try again.')
          }

          return
        }

        if (!data?.participant) {
          setJoinError('The classroom session could not be joined. Please scan the current QR code again.')
          return
        }

        console.log('Classroom session joined:', data)
        setActiveParticipation(data.participant)
        setShowScanner(false)
        setJoinError('')
      } catch (error) {
        console.error('Unexpected QR validation error:', error)
        setJoinError('Something went wrong while verifying the QR code. Please try again.')
      } finally {
        setJoiningSession(false)
      }
    },
    [navigate, student]
  )

  /*
   * ------------------------------------------------------------
   * OPEN SCANNER
   * ------------------------------------------------------------
   */

  function handleOpenScanner() {
    setJoinError('')
    setShowScanner(true)
  }

  /*
   * ------------------------------------------------------------
   * CLOSE SCANNER
   * ------------------------------------------------------------
   */

  function handleCloseScanner() {
    if (joiningSession) {
      return
    }

    setShowScanner(false)
    setJoinError('')
  }

  /*
   * ------------------------------------------------------------
   * LOGOUT
   * ------------------------------------------------------------
   */

  async function handleLogout() {
    await supabase.auth.signOut()

    navigate('/login', {
      replace: true,
    })
  }

  /*
   * ------------------------------------------------------------
   * LOADING STATE
   * ------------------------------------------------------------
   */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  /*
   * ------------------------------------------------------------
   * SAFETY GUARD
   * ------------------------------------------------------------
   */

  if (!student) {
    return null
  }

  /*
   * ------------------------------------------------------------
   * SCANNER VIEW
   * ------------------------------------------------------------
   */

  if (showScanner) {
    return (
      <div className="min-h-screen bg-gray-50">

        <header className="border-b bg-white">
          <div className="max-w-6xl mx-auto px-6 py-4">

            <h1 className="text-xl font-bold">
              Classroom Compliance
            </h1>

            <p className="text-sm text-gray-500">
              Student Portal
            </p>

          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 py-8">

          <div className="max-w-md mx-auto rounded-xl border bg-white p-6">

            {joiningSession ? (

              <div className="flex flex-col items-center justify-center py-12">

                <div className="h-10 w-10 rounded-full border-4 border-gray-200 border-t-black animate-spin" />

                <p className="mt-4 font-medium">
                  Joining classroom...
                </p>

                <p className="mt-1 text-sm text-gray-500 text-center">
                  Verifying your QR code.
                </p>

              </div>

            ) : (

              <StudentScanner
                onScanSuccess={
                  handleScanSuccess
                }
                onClose={
                  handleCloseScanner
                }
              />

            )}

            {joinError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">

                <p className="text-sm text-red-700">
                  {joinError}
                </p>

                {!joiningSession && (
                  <button
                    type="button"
                    onClick={() => {
                      setJoinError('')
                    }}
                    className="mt-3 text-sm font-medium text-red-800 underline"
                  >
                    Try again
                  </button>
                )}

              </div>
            )}

          </div>

        </main>

      </div>
    )
  }

  /*
   * ------------------------------------------------------------
   * NORMAL DASHBOARD
   * ------------------------------------------------------------
   */

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ========================================================
          HEADER
          ======================================================== */}

      <header className="border-b bg-white">

        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">

          <div>

            <h1 className="text-xl font-bold">
              Classroom Compliance
            </h1>

            <p className="text-sm text-gray-500">
              Student Portal
            </p>

          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border px-4 py-2 font-medium hover:bg-gray-100"
          >
            Logout
          </button>


        </div>

      </header>

      {/* ========================================================
          MAIN
          ======================================================== */}

      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* --------------------------------------------------------
            STUDENT INFORMATION
            -------------------------------------------------------- */}

        <div className="mb-8">

          <h2 className="text-3xl font-bold">
            Welcome, {student.name}
          </h2>

          <p className="text-gray-600 mt-2">
            Roll Number: {student.roll_number}
          </p>

        </div>

        {/* --------------------------------------------------------
            JOIN ERROR
            -------------------------------------------------------- */}

        {joinError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">

            <p className="text-sm text-red-700">
              {joinError}
            </p>

          </div>
        )}

        {/* --------------------------------------------------------
            DASHBOARD CARDS
            -------------------------------------------------------- */}

        <div className="grid gap-6 md:grid-cols-3">

          {/* ======================================================
              CLASSROOM SESSION
              ====================================================== */}

          <div className="rounded-xl border bg-white p-6">

            <h3 className="font-semibold text-lg">
              Classroom Session
            </h3>

            {activeParticipation ? (

              <div className="mt-4 space-y-4">

                <div className="flex items-center gap-2">

                  <span
                    className={
                      activeParticipation.status === 'PAUSED'
                        ? 'h-3 w-3 rounded-full bg-yellow-500'
                        : 'h-3 w-3 rounded-full bg-green-500'
                    }
                  />

                  <span className="font-medium">
                    {activeParticipation.status === 'PAUSED'
                      ? 'Session Paused'
                      : 'Session Active'}
                  </span>

                </div>

                <p className="text-sm text-gray-500">
                  {activeParticipation.status === 'PAUSED'
                    ? 'Your classroom participation is currently paused.'
                    : 'You have successfully joined the classroom session.'}
                </p>

                <div className="rounded-lg bg-gray-50 p-4">

                  <p className="text-xs text-gray-400">
                    Login time
                  </p>

                  <p className="text-sm font-medium mt-1">
                    {new Date(
                      activeParticipation.login_at
                    ).toLocaleString()}
                  </p>

                </div>

              </div>

            ) : (

              <div className="mt-4">

                <p className="text-sm text-gray-500 mb-4">
                  Scan the classroom QR code
                  displayed by your faculty to
                  join the session.
                </p>

                <button
                  type="button"
                  onClick={handleOpenScanner}
                  className="w-full rounded-lg bg-black text-white px-5 py-3 font-medium hover:bg-gray-800"
                >
                  Scan Classroom QR
                </button>

              </div>

            )}

          </div>

          {/* ======================================================
              STUDENT INFORMATION
              ====================================================== */}

          <div className="rounded-xl border bg-white p-6">

            <h3 className="font-semibold text-lg">
              My Details
            </h3>

            <div className="mt-4 space-y-3">

              <div>

                <p className="text-xs text-gray-400">
                  Name
                </p>

                <p className="text-sm font-medium">
                  {student.name}
                </p>

              </div>

              <div>

                <p className="text-xs text-gray-400">
                  Roll Number
                </p>

                <p className="text-sm font-medium">
                  {student.roll_number}
                </p>

              </div>

              <div>

                <p className="text-xs text-gray-400">
                  Email
                </p>

                <p className="text-sm font-medium break-all">
                  {student.email}
                </p>

              </div>

            </div>

          </div>

          {/* ======================================================
              ATTENDANCE
              ====================================================== */}

          <div className="rounded-xl border bg-white p-6">

            <h3 className="font-semibold text-lg">
              Attendance
            </h3>

            <p className="text-sm text-gray-500 mt-2">
              Your classroom participation
              history will appear here.
            </p>

          </div>

        </div>

      </main>

    </div>
  )
}

export default StudentDashboard