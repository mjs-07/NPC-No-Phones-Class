import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabase'
import FacultyPauseRequests from '../../components/faculty/FacultyPauseRequests'

const QR_REFRESH_INTERVAL_MS = 5000

function csvEscape(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function formatTimeOnly(value) {
  if (!value) return ''

  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getTotalTimePresentMinutes(loginAt, logoutAt, pausedSeconds) {
  if (!loginAt || !logoutAt) return ''

  const loginMs = new Date(loginAt).getTime()
  const logoutMs = new Date(logoutAt).getTime()

  const elapsedSeconds = Math.max(
    0,
    (logoutMs - loginMs) / 1000
  )

  const presentSeconds = Math.max(
    0,
    elapsedSeconds - Number(pausedSeconds || 0)
  )

  // Whole minutes, rounded to the nearest minute.
  return Math.round(presentSeconds / 60)
}

function downloadAttendanceCsv(session, attendance) {
  const headers = [
    'Roll Number',
    'Student Name',
    'Login Time',
    'Logout Time',
    'Paused Seconds',
    'Logout Reason',
    'Total Time Present (minutes)',
  ]

  const sortedAttendance = [...attendance].sort((a, b) =>
    String(a.roll_number ?? '').localeCompare(
      String(b.roll_number ?? ''),
      undefined,
      { numeric: true, sensitivity: 'base' }
    )
  )

  const rows = sortedAttendance.map((student) => [
    student.roll_number,
    student.student_name,
    formatTimeOnly(student.login_at),
    formatTimeOnly(student.logout_at),
    Number(student.total_paused_seconds || 0),
    student.logout_reason,
    getTotalTimePresentMinutes(
      student.login_at,
      student.logout_at,
      student.total_paused_seconds
    ),
  ])

  const csvContent = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
  ].join('\r\n')

  // BOM helps Excel display UTF-8 correctly.
  const blob = new Blob(
    ['\uFEFF', csvContent],
    { type: 'text/csv;charset=utf-8;' }
  )

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  const sessionName = (session.session_name || 'Session')
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '')
    .replace(/\s+/g, '_')

  const sessionDate = new Date(session.started_at)
    .toLocaleDateString('en-CA')

  link.href = url
  link.download = `${sessionName}_${sessionDate}.csv`

  document.body.appendChild(link)
  link.click()
  link.remove()

  URL.revokeObjectURL(url)
}

function FacultyDashboard() {
  const navigate = useNavigate()

  const [faculty, setFaculty] = useState(null)
  const [activeSession, setActiveSession] = useState(null)

  const [currentQr, setCurrentQr] = useState(null)
  const [qrSecondsLeft, setQrSecondsLeft] = useState(0)

  const [loading, setLoading] = useState(true)
  const [startingSession, setStartingSession] = useState(false)
  const [showStartSessionModal, setShowStartSessionModal] = useState(false)
  const [sessionName, setSessionName] = useState('')
  const [endingSession, setEndingSession] = useState(false)
  const [qrLoading, setQrLoading] = useState(false)

  const [sessionError, setSessionError] = useState('')
  const [qrError, setQrError] = useState('')

  // Student monitoring
  const [participants, setParticipants] = useState([])
  const realtimeParticipantUpdates = useRef(new Map())
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
          'id, session_name, status, started_at, ended_at'
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
    const trimmedSessionName = sessionName.trim()
    if (!trimmedSessionName) {
      setSessionError('Please enter a session name.')
      return
    }

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
          body: { session_name: trimmedSessionName },
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
      setShowStartSessionModal(false)
      setSessionName('')
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
        console.error('End session failed:', error)

        setSessionError(
          error.message || 'Unable to end classroom session.'
        )
        return
      }

      if (
        !data?.session ||
        !Array.isArray(data.attendance)
      ) {
        setSessionError(
          'Session ended, but the attendance report could not be generated.'
        )
        return
      }

      downloadAttendanceCsv(
        data.session,
        data.attendance
      )

      setActiveSession(null)
      setParticipants([])
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

    let refreshInProgress = false

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

    function getServerNowMs() {
      return Date.now() + serverClockOffsetMs
    }

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

      countdownId = setInterval(
        updateCountdown,
        250
      )
    }

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

      const delay = Math.max(
        0,
        switchInMs
      )

      rotationTimeoutId =
        setTimeout(() => {
          if (cancelled) {
            return
          }

          setCurrentQr(nextQr)

          startCountdown(nextQr)

          preparedNextQr = null

          refreshQrData()
        }, delay)
    }

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

        serverClockOffsetMs =
          pair.serverClockOffsetMs

        const nowMs =
          getServerNowMs()

        const currentQr =
          pair.current

        const nextQr =
          pair.next

        if (
          currentQr.expiresAt.getTime() <=
          nowMs
        ) {
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

        preparedNextQr = nextQr

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
          setQrError(
            error.message ||
              'Unable to refresh QR code.'
          )
        }
      } finally {
        refreshInProgress = false
      }
    }

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
          setCurrentQr(
            pair.next
          )

          startCountdown(
            pair.next
          )

          preparedNextQr = null

          await refreshQrData()
        } else {
          throw new Error(
            'QR timing response is no longer valid.'
          )
        }

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
   *
   * RPC loads participant details.
   * Realtime is authoritative for participant status changes.
   * ------------------------------------------------------------------
   */

  useEffect(() => {
    if (!activeSession?.id) {
      setParticipants([])
      setParticipantsError('')
      setParticipantsLoading(false)
      realtimeParticipantUpdates.current.clear()
      return
    }

    let cancelled = false
    let reloadTimeout = null

    const sessionId = activeSession.id

    async function loadParticipants(source = 'manual') {
      if (cancelled) return

      console.log(
        `[NPC Realtime] Loading participants (${source})`
      )

      try {
        const { data, error } = await supabase.rpc(
          'get_session_participants',
          {
            p_session_id: sessionId,
          }
        )

        if (error) throw error

        const rows = data || []

        console.log(
          '[NPC Realtime] RPC participant data:',
          rows
        )

        if (!cancelled) {
          // Preserve latest Realtime values over potentially stale RPC snapshots.
          setParticipants(
            rows.map((participant) => {
              const realtimeUpdate =
                realtimeParticipantUpdates.current.get(
                  participant.participant_id
                )

              return realtimeUpdate
                ? { ...participant, ...realtimeUpdate }
                : participant
            })
          )

          setParticipantsError('')
        }
      } catch (error) {
        console.error(
          '[NPC Realtime] RPC load failed:',
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

    setParticipantsLoading(true)
    setParticipantsError('')

    // Initial participant fetch.
    loadParticipants('initial')

    const channelName =
      `faculty-session-${sessionId}`

    console.log(
      '[NPC Realtime] Creating channel:',
      channelName
    )

    console.log(
      '[NPC Realtime] Session filter:',
      sessionId
    )

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_participants',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          console.log(
            '[NPC Realtime] EVENT RECEIVED:',
            payload.eventType,
            payload
          )

          if (
            payload.eventType === 'UPDATE' &&
            payload.new?.id
          ) {
            const row = payload.new

            const update = {
              status: row.status,
              logout_at: row.logout_at,
              logout_reason: row.logout_reason,
              hidden_at: row.hidden_at,
              last_seen: row.last_seen,
              paused_at: row.paused_at,
              pause_expires_at: row.pause_expires_at,
              total_paused_seconds:
                row.total_paused_seconds,
            }

            // Cache server-reported values to protect against stale RPC responses.
            realtimeParticipantUpdates.current.set(
              row.id,
              update
            )

            setParticipants((current) =>
              current.map((participant) =>
                participant.participant_id === row.id
                  ? {
                      ...participant,
                      ...update,
                    }
                  : participant
              )
            )

            console.log(
              '[NPC Realtime] Applied UPDATE directly:',
              row.id,
              row.status,
              row.logout_reason
            )

            // Realtime is authoritative for UPDATEs.
            // Do not refresh through RPC after an UPDATE.
            return
          }

          // INSERT/DELETE may change membership or require student details.
          if (reloadTimeout) {
            clearTimeout(reloadTimeout)
          }

          reloadTimeout = setTimeout(() => {
            loadParticipants(
              `after-${payload.eventType.toLowerCase()}`
            )
          }, 500)
        }
      )
      .subscribe((status, error) => {
        console.log(
          '[NPC Realtime] SUBSCRIPTION STATUS:',
          status
        )

        if (error) {
          console.error(
            '[NPC Realtime] SUBSCRIPTION ERROR:',
            error
          )
        }

        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT'
        ) {
          console.error(
            '[NPC Realtime] Channel failed:',
            status,
            error
          )
        }

        if (status === 'SUBSCRIBED') {
          console.log(
            '[NPC Realtime] Successfully subscribed to session_participants'
          )

          // Refresh once subscription is active to close the initial-fetch race.
          loadParticipants('subscription-established')
        }
      })

    return () => {
      cancelled = true

      if (reloadTimeout) {
        clearTimeout(reloadTimeout)
      }

      console.log(
        '[NPC Realtime] Removing channel:',
        channelName
      )

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
                {activeSession.session_name && (
                  <p className="text-sm font-semibold text-gray-700">
                    {activeSession.session_name}
                  </p>
                )}

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
                  onClick={() => {
                    setSessionError('')
                    setSessionName('')
                    setShowStartSessionModal(true)
                  }}
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

        </div>
      </main>

      {/* CUSTOM START SESSION MODAL */}
      {showStartSessionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="start-session-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !startingSession) {
              setShowStartSessionModal(false)
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-gray-900">
                  New classroom session
                </p>
                <h2 id="start-session-title" className="mt-1 text-2xl font-bold text-gray-900">
                  Name this session
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                  Add a class or subject name to identify its attendance report.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStartSessionModal(false)}
                disabled={startingSession}
                aria-label="Close modal"
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                handleStartSession()
              }}
            >
              <label htmlFor="session-name" className="mb-2 block text-sm font-medium text-gray-700">
                Session name
              </label>
              <input
                id="session-name"
                type="text"
                value={sessionName}
                onChange={(event) => setSessionName(event.target.value)}
                placeholder="e.g. DBMS - Section A"
                maxLength={80}
                autoFocus
                required
                disabled={startingSession}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-100 disabled:bg-gray-50"
              />
              <p className="mt-2 text-xs text-gray-500">
                The QR code will be generated after you start the session.
              </p>

              {sessionError && (
                <p className="mt-3 text-sm text-red-600">{sessionError}</p>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowStartSessionModal(false)}
                  disabled={startingSession}
                  className="rounded-xl border px-4 py-2.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={startingSession || !sessionName.trim()}
                  className="rounded-xl bg-gray-900 px-5 py-2.5 font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {startingSession ? 'Starting…' : 'Start Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default FacultyDashboard