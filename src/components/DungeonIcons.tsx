// Small inline SVG icons shared across the dungeon-management surfaces
// (DashboardPage.tsx's cards, EditChallengePage.tsx's header/board tab) --
// split out here so both pages draw the exact same glyphs instead of two
// copies that can drift apart.
export function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[13px] w-[13px] shrink-0">
      <rect x="6" y="6" width="10" height="12" rx="1.5" />
      <path d="M9 6V5a1.5 1.5 0 0 1 1.5-1.5h0A1.5 1.5 0 0 1 12 5v1" />
    </svg>
  );
}

export function EditIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[13px] w-[13px] shrink-0"
    >
      <path d="M12.5 4.5 15.5 7.5 7 16H4v-3z" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      <path d="M4 10.5 8 14l8-8" />
    </svg>
  );
}

export function PersonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[13px] w-[13px] shrink-0 text-stone-500">
      <circle cx="10" cy="7" r="3" />
      <path d="M4 17c0-3 2.7-5 6-5s6 2 6 5" />
    </svg>
  );
}

export function PublishIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[13px] w-[13px]"
    >
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

// Adventure's board is a branching path (nodes + lanes); Standard is a
// flat grid -- the same visual distinction the board pages themselves
// draw, shrunk to a badge.
export function BoardTypeIcon({ boardType }: { boardType: string }) {
  if (boardType === 'adventure') {
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-[18px] w-[18px]">
        <circle cx="4" cy="6" r="1.6" />
        <circle cx="4" cy="14" r="1.6" />
        <circle cx="11" cy="10" r="1.6" />
        <circle cx="17" cy="10" r="1.6" />
        <path d="M5.4 6.9 9.7 9.3M5.4 13.1l4.3-2.4M12.6 10h2.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[18px] w-[18px]">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="11" width="6" height="6" rx="1" />
      <rect x="11" y="11" width="6" height="6" rx="1" />
    </svg>
  );
}
