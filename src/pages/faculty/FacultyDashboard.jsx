import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabase'
import FacultyPauseRequests from '../../components/faculty/FacultyPauseRequests'

const QR_REFRESH_INTERVAL_MS = 5000

function FacultyDashboard() {
  const navigate = useNavigate()

  const [faculty, setFaculty] = useState(null)
  const [activeSession, setActiveSession] = useState(null)

  const [currentQr, setCurrentQr] = useState(null)
  const [qrSecondsLeft, setQrSecondsLeft] = useState(0)

  const [loading, setLoading] = useState(true)
  const [startingSession, setStartingSession] = useState(false)
  const [endingSession, setEndingSession] = useState(false)
  const [qrLoading, setQrLoading] = useState(false)

  const [sessionError, setSessionError] = useState('')
  const [qrError, setQrError] = useState('')

  // Student monitoring
  const [participants, setParticipants] = useState([])
  const [participantsLoading, setParticipantsLoading] = useState(false)
  const [participantsError, setParticipantsError] = useState('')

  /*
   * ------------------------------------------------------------------
   * LOAD FACULTY PROFILE + ACTIVE SESSION
   * ------------------------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false

    async function loadFacultyProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        navigate('/login', { replace: true })
        return
      }

      const { data, error } = await supabase
        .from('faculties')
        .select(
          'id, name, college_name, college_email, college_domain'
        )
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        console.error(
          'Faculty profile lookup failed:',
          error
        )

        setLoading(false)
        return
      }

      if (!data) {
        navigate('/faculty/setup', { replace: true })
        return
      }

      setFaculty(data)

      const {
        data: session,
        error: sessionError,
      } = await supabase
        .from('sessions')
        .select(
          'id, status, started_at, ended_at'
        )
        .eq('faculty_id', data.id)
        .eq('status', 'ACTIVE')
        .maybeSingle()

      if (cancelled) return

      if (sessionError) {
        console.error(
          'Active session lookup failed:',
          sessionError
        )
      } else {
        setActiveSession(session)
      }

      setLoading(false)
    }

    loadFacultyProfile()

    return () => {
      cancelled = true
    }
  }, [navigate])

  /*
   * ------------------------------------------------------------------
   * START SESSION
   * ------------------------------------------------------------------
   */

  async function handleStartSession() {
    setStartingSession(true)
    setSessionError('')

    try {
      const {
        data,
        error,
      } = await supabase.functions.invoke(
        'create-session',
        {
          method: 'POST',
          body: {},
        }
      )

      if (error) {
        console.error(
          'Create session failed:',
          error
        )

        setSessionError(
          error.message ||
            'Unable to start classroom session.'
        )

        return
      }

      if (!data?.session) {
        setSessionError(
          'Session was not created correctly.'
        )

        return
      }

      setActiveSession(data.session)
    } catch (error) {
      console.error(
        'Unexpected session creation error:',
        error
      )

      setSessionError(
        'Unable to start classroom session.'
      )
    } finally {
      setStartingSession(false)
    }
  }

  /*
   * ------------------------------------------------------------------
   * END SESSION
   * ------------------------------------------------------------------
   */

  async function handleEndSession() {
    if (!activeSession || endingSession) {
      return
    }

    const confirmed = window.confirm(
      'Are you sure you want to end this classroom session?\n\n' +
        'All active and paused students will be logged out.'
    )

    if (!confirmed) {
      return
    }

    setEndingSession(true)
    setSessionError('')

    try {
      const {
        data,
        error,
      } = await supabase.functions.invoke(
        'end-session',
        {
          method: 'POST',
          body: {
            session_id: activeSession.id,
          },
        }
      )

      if (error) {
        console.error(
          'End session failed:',
          error
        )

        setSessionError(
          error.message ||
            'Unable to end classroom session.'
        )

        return
      }

      console.log(
        'Classroom session ended:',
        data
      )

      /*
       * Removing activeSession automatically
       * stops the QR scheduler through its cleanup.
       */
      setActiveSession(null)

      setCurrentQr(null)
      setQrSecondsLeft(0)
      setQrError('')
    } catch (error) {
      console.error(
        'Unexpected end session error:',
        error
      )

      setSessionError(
        'Unable to end classroom session.'
      )
    } finally {
      setEndingSession(false)
    }
  }

  /*
   * ------------------------------------------------------------------
   * GENERATE QR PAIR
   *
   * Backend returns:
   *
   * current = currently valid QR
   * next    = next 20-second QR
   *
   * Both QR images are generated immediately in the browser.
   * ------------------------------------------------------------------
   */

  async function generateQrPair() {
    if (!activeSession) {
      return null
    }

    const {
      data,
      error,
    } = await supabase.functions.invoke(
      'generate-qr',
      {
        method: 'POST',
        body: {
          session_id: activeSession.id,
        },
      }
    )

    if (error) {
      console.error(
        'Generate QR failed:',
        error
      )

      throw new Error(
        error.message ||
          'Unable to generate QR code.'
      )
    }

    if (
      !data?.server_time ||
      !data?.current?.token ||
      !data?.current?.starts_at ||
      !data?.current?.expires_at ||
      !data?.next?.token ||
      !data?.next?.starts_at ||
      !data?.next?.expires_at
    ) {
      throw new Error(
        'QR response was incomplete.'
      )
    }

    /*
     * Generate both QR images immediately.
     *
     * This means the browser does not need to
     * generate the next QR during rotation.
     */
    const [
      currentImage,
      nextImage,
    ] = await Promise.all([
      QRCode.toDataURL(
        data.current.token,
        {
          width: 320,
          margin: 2,
          errorCorrectionLevel: 'M',
        }
      ),

      QRCode.toDataURL(
        data.next.token,
        {
          width: 320,
          margin: 2,
          errorCorrectionLevel: 'M',
        }
      ),
    ])

    /*
     * Calculate the difference between server time
     * and this browser's clock.
     */
    const serverTimeMs =
      new Date(data.server_time).getTime()

    const clientTimeMs = Date.now()

    const serverClockOffsetMs =
      serverTimeMs - clientTimeMs

    return {
      serverClockOffsetMs,

      current: {
        image: currentImage,
        timeBucket: data.current.time_bucket,
        startsAt: new Date(data.current.starts_at),
        expiresAt: new Date(data.current.expires_at),
      },

      next: {
        image: nextImage,
        timeBucket: data.next.time_bucket,
        startsAt: new Date(data.next.starts_at),
        expiresAt: new Date(data.next.expires_at),
      },
    }
  }

  /*
   * ------------------------------------------------------------------
   * QR SCHEDULER
   *
   * The backend defines the exact QR expiry time.
   * The browser schedules the visual switch for that timestamp.
   * ------------------------------------------------------------------
   */

  useEffect(() => {
    if (!activeSession) {
      setCurrentQr(null)
      setQrSecondsLeft(0)
      setQrError('')
      return
    }

    let cancelled = false

    let rotationTimeoutId = null
    let countdownId = null
    let refreshIntervalId = null

    let preparedNextQr = null
    let serverClockOffsetMs = 0

    /*
     * Prevent overlapping refresh requests.
     */
    let refreshInProgress = false

    /*
     * --------------------------------------------------------------
     * CLEAR TIMERS
     * --------------------------------------------------------------
     */

    function clearRotationTimer() {
      if (rotationTimeoutId !== null) {
        clearTimeout(rotationTimeoutId)
        rotationTimeoutId = null
      }
    }

    function clearCountdownTimer() {
      if (countdownId !== null) {
        clearInterval(countdownId)
        countdownId = null
      }
    }

    function clearRefreshTimer() {
      if (refreshIntervalId !== null) {
        clearInterval(refreshIntervalId)
        refreshIntervalId = null
      }
    }

    /*
     * --------------------------------------------------------------
     * SERVER-ALIGNED NOW
     * --------------------------------------------------------------
     */

    function getServerNowMs() {
      return Date.now() + serverClockOffsetMs
    }

    /*
     * --------------------------------------------------------------
     * COUNTDOWN
     * --------------------------------------------------------------
     */

    function startCountdown(qr) {
      clearCountdownTimer()

      function updateCountdown() {
        if (cancelled) {
          return
        }

        const remainingMs =
          qr.expiresAt.getTime() -
          getServerNowMs()

        const remainingSeconds =
          Math.max(
            0,
            Math.ceil(
              remainingMs / 1000
            )
          )

        setQrSecondsLeft(
          remainingSeconds
        )
      }

      updateCountdown()

      /*
       * 250ms is only for updating the visual
       * countdown. It does NOT control QR rotation.
       */
      countdownId = setInterval(
        updateCountdown,
        250
      )
    }

    /*
     * --------------------------------------------------------------
     * SCHEDULE ROTATION
     * --------------------------------------------------------------
     */

    function scheduleRotation(
      currentQr,
      nextQr
    ) {
      if (cancelled) {
        return
      }

      clearRotationTimer()

      const nowMs =
        getServerNowMs()

      const switchInMs =
        nextQr.startsAt.getTime() -
        nowMs

      /*
       * If the next QR's start time has already
       * passed, do not wait.
       */
      const delay = Math.max(
        0,
        switchInMs
      )

      rotationTimeoutId =
        setTimeout(() => {
          if (cancelled) {
            return
          }

          /*
           * The next QR was already generated
           * before this moment.
           *
           * Therefore this switch requires
           * NO network request.
           */
          setCurrentQr(nextQr)

          startCountdown(nextQr)

          /*
           * The QR currently being displayed is now
           * the previously prepared next QR.
           */
          preparedNextQr = null

          /*
           * Immediately attempt to obtain the
           * following QR pair in the background.
           */
          refreshQrData()
        }, delay)
    }

    /*
     * --------------------------------------------------------------
     * REFRESH QR DATA
     * --------------------------------------------------------------
     */

    async function refreshQrData() {
      if (
        cancelled ||
        refreshInProgress
      ) {
        return
      }

      refreshInProgress = true

      try {
        const pair =
          await generateQrPair()

        if (
          cancelled ||
          !pair
        ) {
          return
        }

        /*
         * Update clock synchronization.
         */
        serverClockOffsetMs =
          pair.serverClockOffsetMs

        const nowMs =
          getServerNowMs()

        const currentQr =
          pair.current

        const nextQr =
          pair.next

        /*
         * If the returned current QR is already
         * expired according to our server-aligned
         * clock, ignore it.
         */
        if (
          currentQr.expiresAt.getTime() <=
          nowMs
        ) {
          /*
           * We are slightly behind the server.
           *
           * The returned next QR may already be
           * the correct QR to display.
           */
          if (
            nextQr.startsAt.getTime() <=
            nowMs &&
            nextQr.expiresAt.getTime() >
              nowMs
          ) {
            setCurrentQr(nextQr)

            startCountdown(nextQr)

            preparedNextQr = null

            return
          }

          return
        }

        /*
         * Update the displayed QR.
         */
        setCurrentQr(
          (previousQr) => {
            if (
              !previousQr ||
              previousQr.timeBucket !==
                currentQr.timeBucket
            ) {
              startCountdown(currentQr)
            }

            return currentQr
          }
        )

        /*
         * Store the next QR in memory.
         */
        preparedNextQr = nextQr

        /*
         * Schedule the exact transition.
         */
        scheduleRotation(
          currentQr,
          nextQr
        )
      } catch (error) {
        console.error(
          'QR background refresh failed:',
          error
        )

        if (!cancelled) {
          /*
           * Do not blank the QR because of a
           * temporary network problem.
           */
          setQrError(
            error.message ||
              'Unable to refresh QR code.'
          )
        }
      } finally {
        refreshInProgress = false
      }
    }

    /*
     * --------------------------------------------------------------
     * INITIALIZE QR
     * --------------------------------------------------------------
     */

    async function initializeQr() {
      setQrLoading(true)
      setQrError('')

      try {
        const pair =
          await generateQrPair()

        if (
          cancelled ||
          !pair
        ) {
          return
        }

        serverClockOffsetMs =
          pair.serverClockOffsetMs

        const nowMs =
          getServerNowMs()

        /*
         * Normally the backend's current QR
         * should still be valid.
         */
        if (
          pair.current.expiresAt.getTime() >
          nowMs
        ) {
          setCurrentQr(
            pair.current
          )

          startCountdown(
            pair.current
          )

          preparedNextQr =
            pair.next

          scheduleRotation(
            pair.current,
            pair.next
          )
        } else if (
          pair.next.startsAt.getTime() <=
            nowMs &&
          pair.next.expiresAt.getTime() >
            nowMs
        ) {
          /*
           * The request arrived right around
           * a rotation boundary.
           *
           * The backend's next QR is now current.
           */
          setCurrentQr(
            pair.next
          )

          startCountdown(
            pair.next
          )

          preparedNextQr = null

          /*
           * Immediately fetch another pair so
           * we have a future QR ready.
           */
          await refreshQrData()
        } else {
          throw new Error(
            'QR timing response is no longer valid.'
          )
        }

        /*
         * Background refresh every 5 seconds.
         * This does not control QR rotation.
         */
        refreshIntervalId =
          setInterval(
            refreshQrData,
            QR_REFRESH_INTERVAL_MS
          )
      } catch (error) {
        console.error(
          'QR initialization failed:',
          error
        )

        if (!cancelled) {
          setQrError(
            error.message ||
              'Unable to generate QR code.'
          )
        }
      } finally {
        if (!cancelled) {
          setQrLoading(false)
        }
      }
    }

    initializeQr()

    /*
     * --------------------------------------------------------------
     * CLEANUP
     * --------------------------------------------------------------
     */

    return () => {
      cancelled = true

      clearRotationTimer()
      clearCountdownTimer()
      clearRefreshTimer()

      preparedNextQr = null
      refreshInProgress = false
    }
  }, [activeSession])

  /*
   * ------------------------------------------------------------------
   * LIVE STUDENT MONITORING
   * ------------------------------------------------------------------
   */

  useEffect(() => {
    if (!activeSession?.id) {
      setParticipants([])
      setParticipantsError('')
      setParticipantsLoading(false)
      return
    }

    let cancelled = false
    let reloadTimeout = null

    const sessionId = activeSession.id

    async function loadParticipants() {
      if (cancelled) return

      setParticipantsLoading(true)
      setParticipantsError('')

      try {
        const { data, error } = await supabase.rpc(
          'get_session_participants',
          {
            p_session_id: sessionId,
          }
        )

        if (error) {
          throw error
        }

        if (!cancelled) {
          setParticipants(data || [])
        }
      } catch (error) {
        console.error(
          'Failed to load session participants:',
          error
        )

        if (!cancelled) {
          setParticipantsError(
            error.message ||
              'Unable to load student information.'
          )
        }
      } finally {
        if (!cancelled) {
          setParticipantsLoading(false)
        }
      }
    }

    // Load participants immediately.
    loadParticipants()

    // Subscribe to changes for this session only.
    const channel = supabase
      .channel(`faculty-session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_participants',
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          // Debounce rapid database changes.
          if (reloadTimeout) {
            clearTimeout(reloadTimeout)
          }

          reloadTimeout = setTimeout(() => {
            loadParticipants()
          }, 300)
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error(
            'Participant Realtime subscription failed.'
          )
        }
      })

    return () => {
      cancelled = true

      if (reloadTimeout) {
        clearTimeout(reloadTimeout)
      }

      supabase.removeChannel(channel)
    }
  }, [activeSession?.id])

  const activeCount = participants.filter(
    (student) => student.status === 'ACTIVE'
  ).length

  const pausedCount = participants.filter(
    (student) => student.status === 'PAUSED'
  ).length

  const loggedOutCount = participants.filter(
    (student) => student.status === 'LOGGED_OUT'
  ).length

  const totalStudents = participants.length

  /*
   * ------------------------------------------------------------------
   * LOGOUT
   * ------------------------------------------------------------------
   */

  async function handleLogout() {
    await supabase.auth.signOut()

    navigate('/login', {
      replace: true,
    })
  }

  /*
   * ------------------------------------------------------------------
   * LOADING STATE
   * ------------------------------------------------------------------
   */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  /*
   * ------------------------------------------------------------------
   * SAFETY GUARD
   * ------------------------------------------------------------------
   */

  if (!faculty) {
    return null
  }

  /*
   * ------------------------------------------------------------------
   * UI
   * ------------------------------------------------------------------
   */

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              Classroom Compliance
            </h1>

            <p className="text-sm text-gray-500">
              Faculty Dashboard
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
        {/* FACULTY WELCOME */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold">
            Welcome, {faculty.name}
          </h2>

          <p className="text-gray-600 mt-2">
            {faculty.college_name}
          </p>
        </div>

        {/* SESSION ERROR */}
        {sessionError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">
              {sessionError}
            </p>
          </div>
        )}

        {/* DASHBOARD CARDS */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* CLASSROOM SESSION */}
          <div className="rounded-xl border bg-white p-6">
            <h3 className="font-semibold text-lg">
              Classroom Session
            </h3>

            {activeSession ? (
              <div className="mt-4 space-y-4">
                {/* Session status */}
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-green-500" />

                  <span className="font-medium">
                    Session Active
                  </span>
                </div>

                {/* Start time */}
                <p className="text-sm text-gray-500">
                  Started at:{' '}
                  {new Date(
                    activeSession.started_at
                  ).toLocaleString()}
                </p>

                {/* QR CODE */}
                <div className="flex flex-col items-center pt-2">
                  {qrLoading && !currentQr ? (
                    <div className="h-80 w-80 flex items-center justify-center border rounded-lg">
                      <p className="text-sm text-gray-500">
                        Generating QR...
                      </p>
                    </div>
                  ) : currentQr ? (
                    <>
                      <img
                        src={currentQr.image}
                        alt="Classroom session QR code"
                        className="w-80 h-80 border rounded-lg"
                      />

                      <p className="mt-3 text-sm font-medium tabular-nums">
                        Refreshing in {qrSecondsLeft}s
                      </p>
                    </>
                  ) : (
                    <div className="h-80 w-80 flex items-center justify-center border rounded-lg">
                      <p className="text-sm text-gray-500">
                        QR code unavailable
                      </p>
                    </div>
                  )}

                  {/* QR error */}
                  {qrError && (
                    <p className="mt-3 text-sm text-red-600 text-center">
                      {qrError}
                    </p>
                  )}
                </div>

                {/* SESSION ID */}
                <p className="text-xs text-gray-400 break-all">
                  Session ID: {activeSession.id}
                </p>

                {/* END SESSION */}
                <button
                  type="button"
                  onClick={handleEndSession}
                  disabled={endingSession}
                  className="w-full rounded-lg bg-red-600 text-white px-5 py-3 font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {endingSession
                    ? 'Ending Session...'
                    : 'End Session'}
                </button>
              </div>
            ) : (
              /* NO ACTIVE SESSION */
              <div className="mt-4">
                <p className="text-sm text-gray-500 mb-4">
                  No active classroom session.
                </p>

                <button
                  type="button"
                  onClick={handleStartSession}
                  disabled={startingSession}
                  className="rounded-lg bg-black text-white px-5 py-3 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {startingSession
                    ? 'Starting...'
                    : 'Start Session'}
                </button>
              </div>
            )}
          </div>

          {/* STUDENTS */}
          <div className="rounded-xl border bg-white p-6 md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-lg">
                  Student Monitoring
                </h3>

                <p className="text-sm text-gray-500 mt-1">
                  Live classroom participation
                </p>
              </div>

              <span className="text-sm text-gray-500">
                {totalStudents} students
              </span>
            </div>

            {/* STATISTICS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">
                  Total
                </p>

                <p className="text-2xl font-bold">
                  {totalStudents}
                </p>
              </div>

              <div className="rounded-lg bg-green-50 p-3">
                <p className="text-xs text-green-700">
                  Active
                </p>

                <p className="text-2xl font-bold text-green-700">
                  {activeCount}
                </p>
              </div>

              <div className="rounded-lg bg-yellow-50 p-3">
                <p className="text-xs text-yellow-700">
                  Paused
                </p>

                <p className="text-2xl font-bold text-yellow-700">
                  {pausedCount}
                </p>
              </div>

              <div className="rounded-lg bg-red-50 p-3">
                <p className="text-xs text-red-700">
                  Logged Out
                </p>

                <p className="text-2xl font-bold text-red-700">
                  {loggedOutCount}
                </p>
              </div>
            </div>

            {/* LOADING */}
            {participantsLoading && participants.length === 0 && (
              <p className="text-sm text-gray-500 mt-6">
                Loading students...
              </p>
            )}

            {/* ERROR */}
            {participantsError && (
              <p className="text-sm text-red-600 mt-4">
                {participantsError}
              </p>
            )}

            {/* EMPTY STATE */}
            {!participantsLoading &&
              !participantsError &&
              participants.length === 0 && (
                <p className="text-sm text-gray-500 mt-6">
                  No students have joined this session yet.
                </p>
              )}

            {/* STUDENT TABLE */}
            {participants.length > 0 && (
              <div className="overflow-x-auto mt-6">
                <table className="w-full text-sm text-left">
                  <thead className="border-b text-gray-500">
                    <tr>
                      <th className="py-3 pr-4">Student</th>
                      <th className="py-3 pr-4">Roll Number</th>
                      <th className="py-3 pr-4">Login Time</th>
                      <th className="py-3 pr-4">Status</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y">
                    {participants.map((student) => {
                      const statusStyles = {
                        ACTIVE: 'bg-green-100 text-green-700',
                        PAUSED: 'bg-yellow-100 text-yellow-700',
                        LOGGED_OUT: 'bg-red-100 text-red-700',
                      }

                      return (
                        <tr key={student.participant_id}>
                          <td className="py-3 pr-4 font-medium">
                            {student.student_name}
                          </td>

                          <td className="py-3 pr-4">
                            {student.roll_number}
                          </td>

                          <td className="py-3 pr-4 whitespace-nowrap">
                            {new Date(
                              student.login_at
                            ).toLocaleTimeString()}
                          </td>

                          <td className="py-3 pr-4">
                            <span
                              className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                                statusStyles[student.status] ||
                                'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {student.status || 'UNKNOWN'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* PAUSE REQUEST MANAGEMENT */}
          {activeSession && (
            <FacultyPauseRequests
              sessionId={activeSession.id}
              participants={participants}
            />
          )}

          {/* REPORTS */}
          <div className="rounded-xl border bg-white p-6">
            <h3 className="font-semibold text-lg">
              Reports
            </h3>

            <p className="text-sm text-gray-500 mt-2">
              Generate attendance and session reports.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

export default FacultyDashboard