import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

function FacultyPauseRequests({ sessionId, participants = [] }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [processingId, setProcessingId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [notification, setNotification] = useState('')

  const participantById = useMemo(
    () =>
      new Map(
        participants.map((participant) => [
          participant.participant_id,
          participant,
        ])
      ),
    [participants]
  )

  useEffect(() => {
    if (!notification) return undefined
    const timer = window.setTimeout(() => setNotification(''), 6000)
    return () => window.clearTimeout(timer)
  }, [notification])

  async function loadRequests() {
    if (!sessionId) {
      setRequests([])
      return
    }

    setLoading(true)

    const { data, error } = await supabase
      .from('pause_requests')
      .select(
        'id, participant_id, student_id, reason, status, requested_at, responded_at, duration_seconds, expires_at'
      )
      .eq('session_id', sessionId)
      .order('requested_at', { ascending: false })

    if (error) {
      console.error('Pause request lookup failed:', error)
      setErrorMessage('Unable to load pause requests.')
    } else {
      setRequests(data || [])
      setErrorMessage('')
    }

    setLoading(false)
  }

  useEffect(() => {
    if (!sessionId) {
      setRequests([])
      return undefined
    }

    let cancelled = false

    async function initialLoad() {
      const { data, error } = await supabase
        .from('pause_requests')
        .select(
          'id, participant_id, student_id, reason, status, requested_at, responded_at, duration_seconds, expires_at'
        )
        .eq('session_id', sessionId)
        .order('requested_at', { ascending: false })

      if (cancelled) return

      if (error) {
        console.error('Pause request lookup failed:', error)
        setErrorMessage('Unable to load pause requests.')
      } else {
        setRequests(data || [])
        setErrorMessage('')
      }
    }

    initialLoad()

    const channel = supabase
      .channel(`faculty-pause-requests-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pause_requests',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new?.status === 'PENDING') {
            const request = payload.new
            const label = request.reason ? `: ${request.reason}` : ''
            setNotification(`New pause request received${label}`)
          }
          void loadRequests()
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Faculty pause request Realtime status:', status)
        }
      })

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [sessionId])

  async function handleResponse(requestId, approve) {
    if (processingId) return

    setProcessingId(requestId)
    setErrorMessage('')

    try {
      const { data, error } = await supabase.rpc(
        'respond_to_pause_request',
        {
          p_request_id: requestId,
          p_approve: approve,
        }
      )

      if (error) throw error

      if (!data?.success) {
        throw new Error('The pause request was not processed.')
      }

      setNotification(approve ? 'Pause request approved.' : 'Pause request rejected.')
      await loadRequests()
    } catch (error) {
      console.error('Pause request response failed:', error)
      setErrorMessage(
        error.message || 'Unable to process this pause request.'
      )
    } finally {
      setProcessingId(null)
    }
  }

  const pendingRequests = requests.filter(
    (request) => request.status === 'PENDING'
  )
  const previousRequests = requests.filter(
    (request) => request.status !== 'PENDING'
  )

  function studentLabel(request) {
    const participant = participantById.get(request.participant_id)
    if (!participant) return `Student ${request.student_id.slice(0, 8)}`
    return `${participant.student_name} (${participant.roll_number})`
  }

  return (
    <section className="rounded-xl border bg-white p-6 md:col-span-3">
      {notification && (
        <div role="status" aria-live="polite" className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
          {notification}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Pause Requests</h3>
          <p className="mt-1 text-sm text-gray-500">
            Review student requests for a temporary pause.
          </p>
        </div>

        <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-semibold text-yellow-800">
          {pendingRequests.length} pending
        </span>
      </div>

      {errorMessage && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      {loading && requests.length === 0 ? (
        <p className="mt-5 text-sm text-gray-500">Loading pause requests...</p>
      ) : pendingRequests.length === 0 ? (
        <p className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
          There are no pending pause requests.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {pendingRequests.map((request) => (
            <div
              key={request.id}
              className="rounded-lg border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{studentLabel(request)}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {request.duration_seconds / 60} minute pause
                  </p>
                </div>

                <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
                  PENDING
                </span>
              </div>

              <p className="mt-3 text-sm text-gray-700">
                <span className="font-medium">Reason: </span>
                {request.reason}
              </p>

              <p className="mt-2 text-xs text-gray-400">
                Requested: {new Date(request.requested_at).toLocaleString()}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleResponse(request.id, true)}
                  disabled={Boolean(processingId)}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processingId === request.id ? 'Processing...' : 'Approve'}
                </button>

                <button
                  type="button"
                  onClick={() => handleResponse(request.id, false)}
                  disabled={Boolean(processingId)}
                  className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processingId === request.id ? 'Processing...' : 'Reject'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {previousRequests.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-medium text-gray-600">
            Previous requests ({previousRequests.length})
          </summary>

          <div className="mt-3 space-y-2">
            {previousRequests.map((request) => (
              <div
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{studentLabel(request)}</p>
                  <p className="text-xs text-gray-500">
                    {request.duration_seconds
                      ? `${request.duration_seconds / 60} minutes`
                      : 'Duration not recorded'}{' '}
                    · {new Date(request.requested_at).toLocaleString()}
                  </p>
                </div>

                <span
                  className={
                    request.status === 'APPROVED'
                      ? 'rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700'
                      : 'rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700'
                  }
                >
                  {request.status}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}

export default FacultyPauseRequests
