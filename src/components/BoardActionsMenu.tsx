import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

// The board page's own kebab menu -- consolidates what used to be a
// handful of separate links/buttons scattered through the sidebar
// ("Set up Dink", the RSN "Edit" link, "Leave Dungeon", "Edit Dungeon")
// into one place in the page header. Each item is optional so the menu
// renders only what's actually available to the current viewer (e.g. a
// host who hasn't joined as a participant gets "Edit Dungeon" but not
// "Change RSN"/"Leave Dungeon").
interface Props {
  onChangeRsn?: () => void;
  editHref?: string;
  onLeave?: () => void;
}

export default function BoardActionsMenu({ onChangeRsn, editHref, onLeave }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const itemClass = 'block w-full px-3 py-2 text-left text-sm text-stone-300 hover:bg-stone-800';

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Dungeon actions"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-700 text-stone-400 hover:border-amber-500 hover:text-stone-200"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <rect x="2" y="4.5" width="16" height="1.6" rx="0.8" />
          <rect x="2" y="9.2" width="16" height="1.6" rx="0.8" />
          <rect x="2" y="13.9" width="16" height="1.6" rx="0.8" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-stone-700 bg-stone-900 py-1 shadow-lg">
          <Link to="/setup" onClick={() => setOpen(false)} className={itemClass}>
            Set up Dink Guide
          </Link>
          {onChangeRsn && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onChangeRsn();
              }}
              className={itemClass}
            >
              Change RSN
            </button>
          )}
          {editHref && (
            <Link to={editHref} onClick={() => setOpen(false)} className={itemClass}>
              Edit Dungeon
            </Link>
          )}
          {onLeave && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLeave();
              }}
              className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-950/40"
            >
              Leave Dungeon
            </button>
          )}
        </div>
      )}
    </div>
  );
}
