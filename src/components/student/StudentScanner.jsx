
import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const SCANNER_ELEMENT_ID = 'student-qr-reader';

export default function StudentScanner({ onScanSuccess, onClose }) {
  const scannerRef = useRef(null);
  const cleanupPromiseRef = useRef(Promise.resolve());
  const handledScanRef = useRef(false);

  const [status, setStatus] = useState('Starting camera...');
  const [error, setError] = useState('');

  useEffect(() => {
    // Each effect execution gets its own cancellation flag.
    // An older effect cannot be accidentally reactivated.
    let cancelled = false;
    let scanner = null;
    let started = false;

    handledScanRef.current = false;

    const previousCleanup = cleanupPromiseRef.current;

    const startPromise = (async () => {
      // Do not initialize another camera until prior cleanup finishes.
      await previousCleanup;

      if (cancelled) return;

      const element = document.getElementById(SCANNER_ELEMENT_ID);

      if (!element) {
        setError('Scanner container could not be found.');
        return;
      }

      element.replaceChildren();

      scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
      scannerRef.current = scanner;

      try {
        setError('');
        setStatus('Requesting camera access...');

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          async (decodedText) => {
            if (cancelled || handledScanRef.current) return;

            handledScanRef.current = true;
            setStatus('QR detected! Joining classroom...');

            try {
              if (scanner.isScanning) {
                await scanner.stop();
              }
            } catch (err) {
              console.warn('Scanner stop:', err);
            }

            try {
              scanner.clear();
            } catch {
              // It may already have been cleared.
            }

            if (scannerRef.current === scanner) {
              scannerRef.current = null;
            }

            if (!cancelled) {
              onScanSuccess(decodedText);
            }
          },
          () => {
            // No QR detected in this frame.
          }
        );

        started = true;

        // Cleanup may have started while camera initialization was pending.
        if (cancelled) return;

        setStatus('Scanning... Point your camera at the classroom QR.');
      } catch (err) {
        console.error('Student scanner error:', err);

        if (!cancelled) {
          const message = String(err?.message || err || '').toLowerCase();

          if (
            message.includes('permission') ||
            message.includes('notallowed')
          ) {
            setError(
              'Camera permission denied. Allow camera access in browser settings.'
            );
          } else if (
            message.includes('notfound') ||
            message.includes('no camera')
          ) {
            setError('No camera was found on this device.');
          } else if (window.location.protocol !== 'https:') {
            setError('Camera access requires HTTPS.');
          } else {
            setError('Unable to start the camera. Please try again.');
          }

          setStatus('Camera could not be started.');
        }
      }
    })();

    return () => {
      cancelled = true;

      // Serialize cleanup with the startup operation. In particular,
      // wait for start() to settle before trying to stop the camera.
      cleanupPromiseRef.current = (async () => {
        try {
          await startPromise;
        } catch {
          // Continue cleanup even if startup failed.
        }

        if (scanner) {
          try {
            if (started && scanner.isScanning) {
              await scanner.stop();
            }
          } catch {
            // The scanner may already be stopped.
          }

          try {
            scanner.clear();
          } catch {
            // It may already be cleared.
          }

          if (scannerRef.current === scanner) {
            scannerRef.current = null;
          }
        }

        const element = document.getElementById(SCANNER_ELEMENT_ID);
        if (element) {
          element.replaceChildren();
        }
      })();
    };
  }, [onScanSuccess]);

  function handleClose() {
    // Closing unmounts this component; the effect cleanup owns camera teardown.
    onClose();
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Scan Classroom QR</h2>
        <p className="mt-1 text-sm text-gray-600">
          Point your camera at the QR code shown by your faculty.
        </p>
      </div>

      <div className="relative w-full overflow-hidden rounded-xl border-2 border-gray-300 bg-black">
        <div id={SCANNER_ELEMENT_ID} className="w-full min-h-[320px]" />
      </div>

      <div className="rounded-lg bg-gray-100 px-4 py-3 text-center">
        {error ? (
          <p className="text-sm font-medium text-red-600">{error}</p>
        ) : (
          <p className="text-sm font-medium text-gray-700">{status}</p>
        )}
      </div>

      <button
        type="button"
        onClick={handleClose}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 font-medium"
      >
        Close Scanner
      </button>
    </div>
  );
}
