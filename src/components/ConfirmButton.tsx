import { useState } from 'react';

// A destructive-ish action (today: "reset to defaults" on the
// Randomize Settings and Discord Templates admin pages) that shouldn't
// fire on a single misclick, but also isn't worth a native confirm()
// dialog -- shared because both pages need the exact same shape
// (button -> inline warning with Confirm/Cancel -> action), unlike the
// admin tables elsewhere, which differ too much per page to share a
// component.
export default function ConfirmButton({
  label,
  warning,
  onConfirm,
  className,
}: {
  label: string;
  warning: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="text-xs text-red-400">
        {warning}{' '}
        <button
          type="button"
          onClick={() => {
            onConfirm();
            setConfirming(false);
          }}
          className="underline"
        >
          Confirm
        </button>{' '}
        &middot;{' '}
        <button type="button" onClick={() => setConfirming(false)} className="underline">
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className={className ?? 'rounded-lg border border-stone-700 px-3 py-2 text-xs text-stone-400 hover:border-red-800 hover:text-red-400'}
    >
      {label}
    </button>
  );
}
