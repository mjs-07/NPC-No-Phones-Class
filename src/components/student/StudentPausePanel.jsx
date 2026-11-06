//StudentPausePanel.jsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

function StudentPausePanel({
  participation,
  onParticipationUpdate,
  onLoggedOut,
}) {
  const [latestRequest, setLatestRequest] = useState(null)
  const [durationSeconds, setDurationSeconds] = useState(60)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [now, setNow] = useState(Date.now())
  const [expiryProcessing, setExpiryProcessing] = useState(false)
  const [notification, setNotification] = useState('')
  const [notificationPermission, setNotificationPermission] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'))
  const previousRequestRef = useRef(null)

  const expiryCheckInProgress = useRef(false)
  const expiryHandled = useRef(false)

  const participantId = participation?.id
  const participationStatus = participation?.status
  const pauseExpiresAt = participation?.pause_expires_at

  useEffect(() => {
    if (!notification) return undefined
    const timer = window.setTimeout(() => setNotification(''), 7000)
    return () => window.clearTimeout(timer)
  }, [notification])

  /*
   * ------------------------------------------------------------
   * LOAD LATEST PAUSE REQUEST
   * ------------------------------------------------------------
   */

  const loadLatestRequest = useCallback(async () => {
    if (!participantId) return

    const { data, error } = await supabase
      .from('pause_requests')
      .select(
        'id, reason, status, requested_at, responded_at, duration_seconds, expires_at'
      )
      .eq('participant_id', participantId)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Pause request lookup failed:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      })

      setRequestError('Unable to load your pause request.')
      return
    }

    setLatestRequest(data || null)
    setRequestError('')
  }, [participantId])

  useEffect(() => {
    if (!participantId) {
      setLatestRequest(null)
      return undefined
    }

    let cancelled = false

    async function initialLoad() {
      const { data, error } = await supabase
        .from('pause_requests')
        .select(
          'id, reason, status, requested_at, responded_at, duration_seconds, expires_at'
        )
        .eq('participant_id', participantId)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        console.error('Pause request lookup failed:', error)
        setRequestError('Unable to load your pause request.')
      } else {
        setLatestRequest(data || null)
        previousRequestRef.current = data ? { id: data.id, status: data.status } : null
        setRequestError('')
      }
    }

    void initialLoad()

    const channel = supabase
      .channel(`student-pause-request-${participantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pause_requests',
          filter: `participant_id=eq.${participantId}`,
        },
        async () => {
          const { data, error } = await supabase
            .from('pause_requests')
            .select('id, reason, status, requested_at, responded_at, duration_seconds, expires_at')
            .eq('participant_id', participantId)
            .order('requested_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (error) {
            console.error('Pause request notification refresh failed:', error)
            return
          }

          const previous = previousRequestRef.current
          if (data && previous?.id === data.id && previous.status === 'PENDING' && data.status !== 'PENDING') {
            const message = data.status === 'APPROVED'
              ? `Your ${Number(data.duration_seconds || 0) / 60}-minute pause request was approved.`
              : 'Your pause request was rejected by the faculty.'
            setNotification(message)
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(data.status === 'APPROVED' ? 'NPC: Pause approved' : 'NPC: Pause rejected', { body: message })
            }
          }
          previousRequestRef.current = data ? { id: data.id, status: data.status } : null
          setLatestRequest(data || null)
          setRequestError('')
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Pause request Realtime status:', status)
        }
      })

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [participantId, loadLatestRequest])

  /*
   * ------------------------------------------------------------
   * COUNTDOWN DISPLAY
   * ------------------------------------------------------------
   */

  useEffect(() => {
    if (participationStatus !== 'PAUSED' || !pauseExpiresAt) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 500)

    return () => window.clearInterval(timer)
  }, [participationStatus, pauseExpiresAt])

  /*
   * ------------------------------------------------------------
   * RECONCILE EXPIRED PAUSE
   *
   * The RPC is responsible for the actual state transition.
   *
   * It:
   * - Resumes the student if the pause has not expired.
   * - Logs out the student if the pause has expired.
   *
   * If the cron job already logged out the student, the RPC may
   * reject the request because the participant is no longer PAUSED.
   * In that case, we read the participant record to get the final state.
   * ------------------------------------------------------------
   */

  const reconcileExpiredPause = useCallback(async () => {
    if (
      !participantId ||
      expiryCheckInProgress.current ||
      expiryHandled.current
    ) {
      return
    }

    expiryCheckInProgress.current = true
    setExpiryProcessing(true)

    try {
      /*
       * First, ask the database to process the pause.
       */
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'resume_student_pause',
        {
          p_participant_id: participantId,
        }
      )

      if (rpcError) {
        console.warn(
          'Pause expiry RPC returned an error. Checking database state:',
          rpcError
        )
      } else {
        console.log('Pause expiry RPC result:', rpcResult)

        if (rpcResult === 'ACTIVE') {
          expiryHandled.current = true

          onParticipationUpdate?.({
            ...participation,
            status: 'ACTIVE',
            paused_at: null,
            pause_expires_at: null,
          })

          setRequestError('')
          return
        }

        if (
          rpcResult === 'PAUSE_TIMEOUT' ||
          rpcResult === 'LOGGED_OUT' ||
          rpcResult === 'SESSION_ENDED'
        ) {
          /*
           * Read the final database record below to obtain
           * the authoritative logout reason.
           */
          console.log('Pause RPC reports logout:', rpcResult)
        }
      }

      /*
       * Whether the RPC succeeded or failed, check the
       * actual participant state in the database.
       */
      const {
        data: currentParticipation,
        error: lookupError,
      } = await supabase
        .from('session_participants')
        .select(
          'id, status, logout_reason, logout_at, paused_at, pause_expires_at'
        )
        .eq('id', participantId)
        .maybeSingle()

      if (lookupError) {
        console.error(
          'Could not verify pause expiry status:',
          lookupError
        )

        setRequestError(
          'Could not verify your pause status. Please keep this page open while we retry.'
        )

        return
      }

      if (!currentParticipation) {
        setRequestError(
          'Your classroom participation record could not be found. Please contact your faculty.'
        )

        return
      }

      /*
       * The database has confirmed that the student is logged out.
       */
      if (currentParticipation.status === 'LOGGED_OUT') {
        expiryHandled.current = true

        const message =
          currentParticipation.logout_reason === 'PAUSE_TIMEOUT'
            ? 'Your approved pause time has expired. You have been logged out of the classroom session.'
            : currentParticipation.logout_reason === 'SESSION_ENDED'
              ? 'Your faculty has ended the classroom session. You have been logged out.'
              : 'Your classroom participation has ended.'

        onParticipationUpdate?.(null)
        onLoggedOut?.(message)

        return
      }

      /*
       * The RPC or another process has already resumed the student.
       */
      if (currentParticipation.status === 'ACTIVE') {
        expiryHandled.current = true

        onParticipationUpdate?.({
          ...participation,
          ...currentParticipation,
        })

        setRequestError('')
        return
      }

      /*
       * The participant is still PAUSED.
       *
       * Do not mark this as handled. The effect below will
       * retry the RPC after a short delay.
       */
      if (currentParticipation.status === 'PAUSED') {
        console.warn(
          'Participant is still PAUSED after expiry check. Will retry.'
        )

        setRequestError(
          'Your pause is being processed. Please wait a moment.'
        )
      }
    } catch (error) {
      console.error('Pause expiry processing failed:', error)

      setRequestError(
        'Unable to process your pause expiry. Please keep this page open while we retry.'
      )
    } finally {
      expiryCheckInProgress.current = false
      setExpiryProcessing(false)
    }
  }, [
    participantId,
    participation,
    onParticipationUpdate,
    onLoggedOut,
  ])

  /*
   * Reset the one-time expiry guard whenever a new pause starts.
   */
  useEffect(() => {
    if (participationStatus !== 'PAUSED') {
      expiryHandled.current = false
      return
    }

    expiryHandled.current = false
  }, [participantId, participationStatus, pauseExpiresAt])

  /*
   * ------------------------------------------------------------
   * AUTOMATIC EXPIRY PROCESSING
   *
   * At zero, invoke the RPC immediately.
   * If the record remains PAUSED, retry every 3 seconds.
   * ------------------------------------------------------------
   */

  useEffect(() => {
    if (
      participationStatus !== 'PAUSED' ||
      !pauseExpiresAt ||
      !participantId ||
      expiryHandled.current
    ) {
      return undefined
    }

    const expiryTime = new Date(pauseExpiresAt).getTime()

    if (!Number.isFinite(expiryTime)) {
      console.error('Invalid pause expiry timestamp:', pauseExpiresAt)
      return undefined
    }

    let retryTimer = null
    let cancelled = false

    const checkExpiry = async () => {
      if (cancelled || expiryHandled.current) return

      const remainingMs = expiryTime - Date.now()

      if (remainingMs > 0) {
        return
      }

      await reconcileExpiredPause()
    }

    /*
     * Schedule the first check for the expiry time.
     * Use a short interval afterwards in case the RPC or cron
     * has not completed the transition yet.
     */
    const initialDelay = Math.max(0, expiryTime - Date.now())

    const initialTimer = window.setTimeout(() => {
      if (cancelled) return

      void checkExpiry()

      retryTimer = window.setInterval(() => {
        void checkExpiry()
      }, 3000)
    }, initialDelay)

    return () => {
      cancelled = true
      window.clearTimeout(initialTimer)

      if (retryTimer !== null) {
        window.clearInterval(retryTimer)
      }
    }
  }, [
    participantId,
    participationStatus,
    pauseExpiresAt,
    reconcileExpiredPause,
  ])

  /*
   * ------------------------------------------------------------
   * REQUEST PAUSE
   * ------------------------------------------------------------
   */

  async function handleRequestPause(event) {
    event.preventDefault()

    if (!participantId || loading) return

    if (participationStatus !== 'ACTIVE') {
      setRequestError('Only an active participant can request a pause.')
      return
    }

    if (!reason.trim()) {
      setRequestError('Please enter a reason for your pause request.')
      return
    }

    setLoading(true)
    setRequestError('')

    try {
      const { error } = await supabase.rpc(
        'create_pause_request',
        {
          p_participant_id: participantId,
          p_reason: reason.trim(),
          p_duration_seconds: durationSeconds,
        }
      )

      if (error) throw error

      setReason('')
      await loadLatestRequest()
    } catch (error) {
      console.error('Pause request submission failed:', error)

      setRequestError(
        error.message || 'Unable to submit your pause request.'
      )
    } finally {
      setLoading(false)
    }
  }

  /*
   * ------------------------------------------------------------
   * MANUAL RESUME
   *
   * The same RPC is used for manual resume and expiry processing.
   * ------------------------------------------------------------
   */

  async function handleResume() {
    if (!participantId || loading || expiryProcessing) return

    setLoading(true)
    setRequestError('')

    try {
      const { data, error } = await supabase.rpc(
        'resume_student_pause',
        {
          p_participant_id: participantId,
        }
      )

      if (error) throw error

      console.log('Manual resume result:', data)

      if (data === 'ACTIVE') {
        expiryHandled.current = true

        onParticipationUpdate?.({
          ...participation,
          status: 'ACTIVE',
          paused_at: null,
          pause_expires_at: null,
        })

        await loadLatestRequest()
        return
      }

      if (
        data === 'PAUSE_TIMEOUT' ||
        data === 'LOGGED_OUT' ||
        data === 'SESSION_ENDED'
      ) {
        await reconcileExpiredPause()
        return
      }

      /*
       * If the RPC returned another value, verify the database.
       */
      await reconcileExpiredPause()
    } catch (error) {
      console.error('Manual pause resume failed:', error)

      /*
       * A cron job may have logged the student out just before
       * this RPC was called. Reconcile the actual database state.
       */
      await reconcileExpiredPause()

      setRequestError(
        error.message || 'Unable to resume your classroom session.'
      )
    } finally {
      setLoading(false)
    }
  }

  /*
   * ------------------------------------------------------------
   * COUNTDOWN DISPLAY
   * ------------------------------------------------------------
   */

  const remainingSeconds =
    participationStatus === 'PAUSED' && pauseExpiresAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(pauseExpiresAt).getTime() - now) / 1000
          )
        )
      : 0

  const formatDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60)
    const remainder = seconds % 60

    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
  }

  if (!participation) return null

  /*
   * ------------------------------------------------------------
   * UI
   * ------------------------------------------------------------
   */

  return (
    <section className="mt-5 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">Pause Management</h4>
        {'Notification' in window && notificationPermission !== 'granted' && (
          <button
            type="button"
            onClick={async () => {
              const permission = await Notification.requestPermission()
              setNotificationPermission(permission)
            }}
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
          >
            Enable desktop notifications
          </button>
        )}
      </div>
      {notification && (
        <div role="status" aria-live="polite" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
          {notification}
        </div>
      )}

      {participationStatus === 'PAUSED' ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg bg-yellow-50 p-4">
            <p className="text-sm font-medium text-yellow-800">
              Your pause is approved
            </p>

            <p className="mt-1 text-3xl font-bold tabular-nums text-yellow-900">
              {formatDuration(remainingSeconds)}
            </p>

            <p className="mt-1 text-xs text-yellow-800">
              {remainingSeconds > 0
                ? 'Time remaining'
                : expiryProcessing
                  ? 'Processing your pause expiry...'
                  : 'Your pause has expired. Processing your session status...'}
            </p>

            {remainingSeconds > 0 && remainingSeconds <= 10 && (
              <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                Your pause ends in {remainingSeconds} {remainingSeconds === 1 ? 'second' : 'seconds'}. Resume now to avoid automatic logout.
              </p>
            )}
          </div>

          {remainingSeconds > 0 ? (
            <button
              type="button"
              onClick={handleResume}
              disabled={loading || expiryProcessing}
              className="w-full rounded-lg bg-black px-4 py-2.5 font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Resuming...' : 'Resume Session'}
            </button>
          ) : (
            <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
              {expiryProcessing
                ? 'Please wait while the server updates your session.'
                : 'Your session status is being verified.'}
            </div>
          )}
        </div>
      ) : (
        <>
          {latestRequest?.status === 'PENDING' ? (
            <div className="mt-3 rounded-lg bg-yellow-50 p-3">
              <p className="font-medium text-yellow-800">
                Pause request pending
              </p>

              <p className="mt-1 text-sm text-yellow-700">
                Your faculty has not responded yet. Your session remains active.
              </p>

              <p className="mt-2 text-xs text-yellow-700">
                Requested duration:{' '}
                {latestRequest.duration_seconds / 60} minutes
              </p>
            </div>
          ) : latestRequest?.status === 'REJECTED' ? (
            <div className="mt-3 rounded-lg bg-red-50 p-3">
              <p className="font-medium text-red-700">
                Your previous request was rejected.
              </p>
            </div>
          ) : latestRequest?.status === 'APPROVED' ? (
            <div className="mt-3 rounded-lg bg-gray-50 p-3">
              <p className="text-sm text-gray-600">
                Your previous pause request has been completed.
              </p>
            </div>
          ) : null}

          {latestRequest?.status !== 'PENDING' && (
            <form
              onSubmit={handleRequestPause}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Requested duration
                </label>

                <select
                    value={durationSeconds}
                    onChange={(event) =>
                        setDurationSeconds(Number(event.target.value))
                    }
                    className="w-full rounded-lg border bg-white px-3 py-2"
                    disabled={loading || participationStatus !== 'ACTIVE'}
                    >
                    <option value={60}>1 minute (Testing)</option>
                    <option value={300}>5 minutes</option>
                    <option value={600}>10 minutes</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Reason
                </label>

                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  rows={2}
                  required
                  placeholder="Briefly explain why you need a pause"
                  className="w-full resize-y rounded-lg border px-3 py-2"
                  disabled={loading || participationStatus !== 'ACTIVE'}
                />
              </div>

              <button
                type="submit"
                disabled={
                  loading ||
                  participationStatus !== 'ACTIVE' ||
                  !reason.trim()
                }
                className="w-full rounded-lg bg-black px-4 py-2.5 font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Submitting...' : 'Request Pause'}
              </button>
            </form>
          )}
        </>
      )}

      {requestError && (
        <p className="mt-3 text-sm text-red-600">
          {requestError}
        </p>
      )}
    </section>
  )
}

export default StudentPausePanel