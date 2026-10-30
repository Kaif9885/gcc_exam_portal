import React, { useState } from 'react';

/**
 * Simple button that launches a native UPI app using a deep‑link URL.
 * The URL format is:
 *   upi://pay?pa=<VPA>&pn=<PayeeName>&am=<Amount>&cu=INR&tn=<Note>
 * When the browser navigates to that URL, the OS opens the selected UPI app.
 */
export function UPIButton({
  vpa,
  name,
  amount,
  txnNote = 'Exam payment',
  className = '',
}: {
  vpa: string; // e.g. "school@upi"
  name: string; // Payee name displayed to user
  amount: number; // amount in rupees (float)
  txnNote?: string;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    try {
      const url = new URL('upi://pay');
      url.searchParams.set('pa', vpa);
      url.searchParams.set('pn', name);
      url.searchParams.set('am', amount.toFixed(2));
      url.searchParams.set('cu', 'INR');
      url.searchParams.set('tn', txnNote);
      // Navigate – the browser will invoke the native UPI app.
      window.location.href = url.toString();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    }
  }

  return (
    <div className={className}>
      <button onClick={handleClick} className="button button-primary">
        Pay ₹{amount.toFixed(2)} via UPI
      </button>
      {error && (
        <p className="notice warning" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

