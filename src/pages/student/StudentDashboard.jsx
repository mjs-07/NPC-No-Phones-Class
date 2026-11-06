//StudentDashboard.jsx
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import StudentScanner from '../../components/student/StudentScanner'
import StudentPausePanel from '../../components/student/StudentPausePanel'

function StudentDashboard() {
  const navigate = useNavigate()

  const [student, setStudent] = useState(null)
  const [activeParticipation, setActiveParticipation] = useState(null)
  const [facultyPaused, setFacultyPaused] = useState(false)
  const [facultyPausedAt, setFacultyPausedAt] = useState(null)
  const [classroomNotification, setClassroomNotification] = useState('')

  const [loading, setLoading] = useState(true)
  const [showScanner, setShowScanner] = useState(false)
  const [joiningSession, setJoiningSession] = useState(false)
  const [joinError, setJoinError] = useState('')

  const participationEventQueue = useRef(Promise.resolve())
  const forcedLogoutInProgress = useRef(false)
  const activeParticipationRef = useRef(null)
  const classroomPauseStateRef = useRef(false)

  // Keep refs current without rebuilding the Realtime subscription.
  activeParticipationRef.current = activeParticipation
  classroomPauseStateRef.current = facultyPaused

  useEffect(() => {
    if (!classroomNotification) return undefined
    const timer = window.setTimeout(() => setClassroomNotification(''), 7000)
    return () => window.clearTimeout(timer)
  }, [classroomNotification])

  /*
   * ------------------------------------------------------------
   * SHOW LOGOUT MESSAGE WHEN PAUSE OR SESSION ENDS
   * ------------------------------------------------------------
   *
   * We intentionally keep the student's authentication session
   * alive here so the dashboard can display the logout message.
   *
   * The database prevents the student from rejoining the same
   * classroom session.
   */

  const handlePauseLogout = useCallback((message) => {
    setActiveParticipation(null)
    setShowScanner(false)
    setJoiningSession(false)
    setJoinError(message)
  }, [])

  /*
   * ------------------------------------------------------------
   * SERVER HEARTBEAT / VISIBILITY EVENTS
   * ------------------------------------------------------------
   */

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

            /*
             * A failed network request does not automatically
             * mean the student has been logged out.
             *
             * Check the database to confirm the actual state.
             */
            const {
              data: currentParticipation,
              error: lookupError,
            } = await supabase
              .from('session_participants')
              .select('status, logout_reason')
              .eq('id', participation.id)
              .eq('session_id', participation.session_id)
              .maybeSingle()

            if (lookupError) {
              console.error(
                'Could not verify participation status:',
                lookupError
              )
              return
            }

            if (currentParticipation?.status === 'LOGGED_OUT') {
              const reason = currentParticipation.logout_reason

              const message =
                reason === 'SESSION_ENDED'
                  ? 'Your faculty has ended the classroom session. You are now logged out.'
                  : reason === 'TAB_SWITCH'
                    ? 'You were logged out because the classroom page was hidden for more than 5 seconds.'
                    : reason === 'PAUSE_TIMEOUT'
                      ? 'Your approved pause time has expired. You have been logged out of the classroom session.'
                      : 'Your classroom participation has ended.'

              handlePauseLogout(message)
            }

            return
          }

          if (data?.status === 'LOGGED_OUT') {
            const reason =
              data.logout_reason || data.reason

            const message =
              reason === 'SESSION_ENDED'
                ? 'Your faculty has ended the classroom session. You are now logged out.'
                : reason === 'TAB_SWITCH'
                  ? 'You were logged out because the classroom page was hidden for more than 5 seconds.'
                  : reason === 'PAUSE_TIMEOUT'
                    ? 'Your approved pause time has expired. You have been logged out of the classroom session.'
                    : 'Your classroom participation has ended.'

            handlePauseLogout(message)
          }

          if (data?.success === false) {
            console.warn(
              `Student ${action} event was not accepted:`,
              data
            )
          }
        } catch (error) {
          console.error(
            `Student ${action} request failed:`,
            error
          )
        }
      }

      /*
       * Serialize events so a quick hide/show sequence
       * cannot send the visible event before hidden.
       */
      const queuedRequest =
        participationEventQueue.current.then(send, send)

      participationEventQueue.current =
        queuedRequest.catch(() => {})

      return queuedRequest
    },
    [handlePauseLogout]
  )

  /*
   * ------------------------------------------------------------
   * PARTICIPANT REALTIME SUBSCRIPTION
   * ------------------------------------------------------------
   *
   * Detect:
   * - Faculty ending the session.
   * - Pause timeout.
   * - Tab-switch logout.
   * - Student being resumed.
   */

  useEffect(() => {
    const participation = activeParticipation

    if (
      !participation?.id ||
      !['ACTIVE', 'PAUSED'].includes(participation.status)
    ) {
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

          if (!updated) return

          /*
           * Student is still participating.
           */
          if (
            updated.status === 'ACTIVE' ||
            updated.status === 'PAUSED'
          ) {
            setActiveParticipation((previous) =>
              previous?.id === updated.id
                ? { ...previous, ...updated }
                : previous
            )

            return
          }

          /*
           * Student has been logged out.
           */
          if (updated.status === 'LOGGED_OUT') {
            const message =
              updated.logout_reason === 'SESSION_ENDED'
                ? 'Your faculty has ended the classroom session. You are now logged out.'
                : updated.logout_reason === 'TAB_SWITCH'
                  ? 'You were logged out because the classroom page was hidden for more than 5 seconds.'
                  : updated.logout_reason === 'PAUSE_TIMEOUT'
                    ? 'Your approved pause time has expired. You have been logged out of the classroom session.'
                    : 'Your classroom participation has ended.'

            handlePauseLogout(message)
          }
        }
      )
      .subscribe((status) => {
        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT'
        ) {
          console.warn(
            'Participant Realtime subscription status:',
            status
          )
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [activeParticipation, handlePauseLogout])

  /*
   * ------------------------------------------------------------
   * VISIBILITY TRACKING AND HEARTBEAT
   * ------------------------------------------------------------
   */

  useEffect(() => {
    const participation = activeParticipation

    if (
      !participation ||
      facultyPaused ||
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

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    )

    const heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void sendParticipationEvent('heartbeat', participation)
      }
    }, 10_000)

    return () => {
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      )

      window.clearInterval(heartbeatTimer)
    }
  }, [activeParticipation, facultyPaused, sendParticipationEvent])

  // Load and subscribe to the classroom-wide pause state.
  // The channel is created once per session ID. It is deliberately NOT
  // dependent on facultyPaused or the participation object, so a pause
  // event cannot tear down and recreate the channel while it is handling
  // the event.
  useEffect(() => {
    const sessionId = activeParticipation?.session_id
    if (!sessionId) {
      setFacultyPaused(false)
      setFacultyPausedAt(null)
      classroomPauseStateRef.current = false
      return undefined
    }

    let cancelled = false
    let receivedRealtimeUpdate = false

    const applyClassroomState = (updated, source = 'realtime') => {
      if (!updated) return

      const wasPaused = classroomPauseStateRef.current
      const isPaused = updated.faculty_paused === true

      if (wasPaused !== isPaused) {
        const message = isPaused
          ? 'Your faculty has paused the entire classroom.'
          : 'Your faculty has resumed the classroom. Normal monitoring has restarted.'

        setClassroomNotification(message)

        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(
              isPaused ? 'NPC: Classroom paused' : 'NPC: Classroom resumed',
              { body: message }
            )
          } catch (notificationError) {
            console.warn('Desktop notification could not be displayed:', notificationError)
          }
        }
      }

      classroomPauseStateRef.current = isPaused
      setFacultyPaused(isPaused)
      setFacultyPausedAt(updated.faculty_paused_at || null)

      // When resumed, immediately restart the visible heartbeat. The server
      // also checks faculty_paused, so this is safe if events overlap.
      if (wasPaused && !isPaused && document.visibilityState === 'visible') {
        const currentParticipation = activeParticipationRef.current
        if (currentParticipation?.session_id === sessionId) {
          void sendParticipationEvent('visible', currentParticipation)
          void sendParticipationEvent('heartbeat', currentParticipation)
        }
      }

      if (source === 'realtime') {
        console.info('NPC classroom state received through Realtime:', {
          sessionId,
          facultyPaused: isPaused,
        })
      }
    }

    const loadClassroomState = async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, status, faculty_paused, faculty_paused_at')
        .eq('id', sessionId)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        console.error('Classroom pause state lookup failed:', error)
        return
      }

      // Initial load establishes the baseline; do not show a notification
      // merely because the student opened the page while already paused.
      // Do not overwrite a newer Realtime event if the fetch raced with it.
      if (!receivedRealtimeUpdate) {
        classroomPauseStateRef.current = data?.faculty_paused === true
        setFacultyPaused(data?.faculty_paused === true)
        setFacultyPausedAt(data?.faculty_paused_at || null)
      }
    }

    void loadClassroomState()

    const channel = supabase
      .channel(`student-classroom-state-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          // Ignore unrelated session updates; only the classroom pause
          // fields affect the student's classroom state.
          if (!payload?.new) return
          receivedRealtimeUpdate = true
          applyClassroomState(payload.new, 'realtime')
        }
      )
      .subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          console.info(`NPC classroom Realtime connected for session ${sessionId}`)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('NPC classroom Realtime subscription failed:', status, error)
        } else if (status === 'CLOSED') {
          console.warn('NPC classroom Realtime channel closed:', sessionId)
        }
      })

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [activeParticipation?.session_id, sendParticipationEvent])

  /*
   * ------------------------------------------------------------
   * LOAD ACTIVE PARTICIPATION
   * ------------------------------------------------------------
   */

  const loadActiveParticipation = useCallback(
    async (studentId) => {
      const { data, error } = await supabase
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
        .eq('student_id', studentId)
        .in('status', ['ACTIVE', 'PAUSED'])
        .order('created_at', { ascending: false })
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
        )

        setJoinError(
          'Could not restore your classroom session. Please refresh the page.'
        )

        return
      }

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
          error: authError,
        } = await supabase.auth.getUser()

        if (cancelled) return

        if (authError || !user) {
          navigate('/login', { replace: true })
          return
        }

        const { data, error } = await supabase
          .from('students')
          .select('id, name, roll_number, email')
          .eq('auth_user_id', user.id)
          .maybeSingle()

        if (cancelled) return

        if (error) {
          console.error(
            'Student profile lookup failed:',
            error
          )

          setLoading(false)
          return
        }

        if (!data) {
          navigate('/login', { replace: true })
          return
        }

        setStudent(data)

        await loadActiveParticipation(data.id)

        if (cancelled) return

        setLoading(false)
      } catch (error) {
        if (cancelled) return

        console.error(
          'Student dashboard initialization failed:',
          error
        )

        setLoading(false)
      }
    }

    void loadStudentProfile()

    return () => {
      cancelled = true
    }
  }, [navigate, loadActiveParticipation])

  /*
   * ------------------------------------------------------------
   * FORCED LOGOUT
   * ------------------------------------------------------------
   *
   * Used when the server rejects a QR scan because the student
   * has already been permanently logged out of the session.
   */

  const handleForcedLogout = useCallback(
    async (message) => {
      if (forcedLogoutInProgress.current) return

      forcedLogoutInProgress.current = true

      setShowScanner(false)
      setJoiningSession(false)
      setJoinError(message)

      try {
        await supabase.auth.signOut()
      } catch (error) {
        console.error(
          'Forced student logout failed:',
          error
        )
      }

      window.setTimeout(() => {
        navigate('/login', { replace: true })
      }, 2500)
    },
    [navigate]
  )

  /*
   * ------------------------------------------------------------
   * HANDLE QR SCAN
   * ------------------------------------------------------------
   */

  const handleScanSuccess = useCallback(
    async (decodedToken) => {
      if (
        !decodedToken ||
        forcedLogoutInProgress.current
      ) {
        return
      }

      setJoiningSession(true)
      setJoinError('')

      try {
        const { data, error } =
          await supabase.functions.invoke(
            'validate-qr',
            {
              method: 'POST',
              body: {
                token: decodedToken,
              },
            }
          )

        if (error) {
          console.error(
            'QR validation failed:',
            error
          )

          /*
           * Extract the actual Edge Function response body.
           */
          let responseBody = null

          try {
            if (
              error.context &&
              typeof error.context.clone === 'function'
            ) {
              responseBody = await error.context.clone().json()
            }
          } catch {
            // The response may not contain JSON.
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

          /*
           * Check whether this student has recently been logged out.
           *
           * This is important because some Edge Function responses
           * contain only a generic non-2xx error.
           */
          let recentLogout = null

          if (student?.id) {
            const recentCutoff = new Date(
              Date.now() - 24 * 60 * 60 * 1000
            ).toISOString()

            const {
              data: recentRecord,
              error: historyError,
            } = await supabase
              .from('session_participants')
              .select(
                'id, status, logout_at, logout_reason'
              )
              .eq('student_id', student.id)
              .eq('status', 'LOGGED_OUT')
              .in('logout_reason', [
                'TAB_SWITCH',
                'PAUSE_TIMEOUT',
                'STUDENT_LOGOUT',
              ])
              .gte('logout_at', recentCutoff)
              .order('logout_at', { ascending: false })
              .limit(1)
              .maybeSingle()

            if (historyError) {
              console.error(
                'Could not check recent logout history:',
                historyError
              )
            } else {
              recentLogout = recentRecord
            }
          }

          const wasLoggedOutForTabSwitch =
            responseDetails.includes('tab switch') ||
            responseDetails.includes('tab_switch') ||
            recentLogout?.logout_reason === 'TAB_SWITCH'

          const wasLoggedOutForPauseTimeout =
            responseDetails.includes('pause_timeout') ||
            responseDetails.includes('pause timeout') ||
            recentLogout?.logout_reason === 'PAUSE_TIMEOUT'

          const wasAlreadyLoggedOut =
            responseDetails.includes('already participating') ||
            responseDetails.includes('already joined') ||
            responseDetails.includes('cannot rejoin') ||
            responseDetails.includes('cannot join again') ||
            responseDetails.includes('not allowed to rejoin')

          /*
           * Permanent logout: close scanner, sign out, redirect.
           */
          if (
            wasLoggedOutForTabSwitch ||
            wasLoggedOutForPauseTimeout ||
            wasAlreadyLoggedOut
          ) {
            const message = wasLoggedOutForPauseTimeout
              ? 'Your approved pause time expired. You cannot rejoin this classroom session. You will be redirected to login.'
              : wasLoggedOutForTabSwitch
                ? 'You were logged out because the classroom page was hidden for more than 5 seconds. You will be redirected to login.'
                : 'You have already been logged out of this classroom session. Rejoining is not permitted. You will be redirected to login.'

            await handleForcedLogout(message)
            return
          }

          /*
           * Other QR errors should remain on the scanner.
           */
          if (responseDetails.includes('expired')) {
            setJoinError(
              'This QR code has expired. Please scan the current classroom QR code.'
            )
          } else if (
            responseDetails.includes('invalid qr') ||
            responseDetails.includes('currently valid')
          ) {
            setJoinError(
              'This QR code is invalid. Please scan the current classroom QR code.'
            )
          } else {
            setJoinError(
              'We could not verify this QR code. Please scan the current classroom QR code and try again.'
            )
          }

          return
        }

        if (!data?.participant) {
          setJoinError(
            'The classroom session could not be joined. Please scan the current QR code again.'
          )

          return
        }

        console.log('Classroom session joined:', data)

        setActiveParticipation(data.participant)
        setShowScanner(false)
        setJoinError('')
      } catch (error) {
        console.error(
          'Unexpected QR validation error:',
          error
        )

        setJoinError(
          'Something went wrong while verifying the QR code. Please try again.'
        )
      } finally {
        setJoiningSession(false)
      }
    },
    [student, handleForcedLogout]
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
    if (joiningSession) return

    setShowScanner(false)
    setJoinError('')
  }

  /*
   * ------------------------------------------------------------
   * NORMAL STUDENT LOGOUT
   * ------------------------------------------------------------
   */

  async function handleLogout() {
    await supabase.auth.signOut()

    navigate('/login', { replace: true })
  }

  /*
   * ------------------------------------------------------------
   * LOADING VIEW
   * ------------------------------------------------------------
   */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  if (!student) return null

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
                onScanSuccess={handleScanSuccess}
                onClose={handleCloseScanner}
              />
            )}

            {joinError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">
                  {joinError}
                </p>

                {!joiningSession &&
                  !forcedLogoutInProgress.current && (
                    <button
                      type="button"
                      onClick={() => setJoinError('')}
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
    <div className="npc-dashboard min-h-screen bg-gray-50">
      {/* HEADER */}
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

      {/* MAIN */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {classroomNotification && (
          <div role="status" aria-live="polite" className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
            {classroomNotification}
          </div>
        )}
        {/* STUDENT INFORMATION */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold">
            Welcome, {student.name}
          </h2>

          <p className="mt-2 text-gray-600">
            Roll Number: {student.roll_number}
          </p>
        </div>

        {/* LOGOUT / SESSION MESSAGE */}
        {joinError && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
          >
            <p className="text-sm text-red-700">
              {joinError}
            </p>
          </div>
        )}

        {/* DASHBOARD CARDS */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* CLASSROOM SESSION */}
          <div className="rounded-xl border bg-white p-6">
            <h3 className="text-lg font-semibold">
              Classroom Session
            </h3>

            {activeParticipation ? (
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${facultyPaused || activeParticipation.status === 'PAUSED' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                  <span className="font-medium">
                    {facultyPaused
                      ? 'Classroom Paused by Faculty'
                      : activeParticipation.status === 'PAUSED'
                        ? 'Your Individual Pause is Active'
                        : 'Session Active'}
                  </span>
                </div>

                <p className="text-sm text-gray-500">
                  {facultyPaused
                    ? 'The faculty has paused the entire classroom. You remain logged in. Tab-switch monitoring and individual pause requests are temporarily suspended.'
                    : activeParticipation.status === 'PAUSED'
                      ? 'Your individual classroom participation is currently paused.'
                      : 'You have successfully joined the classroom session.'}
                </p>

                {facultyPaused && (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                    <p className="font-semibold">Classroom-wide pause</p>
                    <p className="mt-1">Please wait. Your session will continue when your faculty resumes the classroom.</p>
                    {facultyPausedAt && <p className="mt-2 text-xs">Paused at: {new Date(facultyPausedAt).toLocaleTimeString()}</p>}
                  </div>
                )}

                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs text-gray-400">
                    Login time
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {new Date(
                      activeParticipation.login_at
                    ).toLocaleString()}
                  </p>
                </div>

                {'Notification' in window && Notification.permission !== 'granted' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const permission = await Notification.requestPermission()
                      if (permission === 'granted') setClassroomNotification('Desktop notifications enabled.')
                    }}
                    className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-gray-50"
                  >
                    Enable desktop notifications
                  </button>
                )}

                {!facultyPaused && (
                  <StudentPausePanel
                    participation={activeParticipation}
                    onParticipationUpdate={setActiveParticipation}
                    onLoggedOut={handlePauseLogout}
                  />
                )}
              </div>
            ) : (
              <div className="mt-4">
                <p className="mb-4 text-sm text-gray-500">
                  {joinError
                    ? 'Your previous classroom participation has ended. You cannot rejoin the same session.'
                    : 'Scan the classroom QR code displayed by your faculty to join the session.'}
                </p>

                <button
                  type="button"
                  onClick={handleOpenScanner}
                  className="w-full rounded-lg bg-black px-5 py-3 font-medium text-white hover:bg-gray-800"
                >
                  Scan Classroom QR
                </button>
              </div>
            )}
          </div>

          {/* STUDENT INFORMATION */}
          <div className="rounded-xl border bg-white p-6">
            <h3 className="text-lg font-semibold">
              My Details
            </h3>

            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs text-gray-400">Name</p>

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
                <p className="text-xs text-gray-400">Email</p>

                <p className="break-all text-sm font-medium">
                  {student.email}
                </p>
              </div>
            </div>
          </div>

          {/* ATTENDANCE */}
          <div className="rounded-xl border bg-white p-6">
            <h3 className="text-lg font-semibold">
              Attendance
            </h3>

            <p className="mt-2 text-sm text-gray-500">
              Your classroom participation history will appear here.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

export default StudentDashboard