// The site's mark -- a dungeon archway with a torch flame -- used next to
// the "Dungeon Crawl" wordmark in Header.tsx and standalone in
// HomePage.tsx's hero. Pure SVG (no wiki-icon dependency) so it renders
// instantly and matches the amber/stone palette exactly at any size.
export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M12 44V22C12 14.268 17.373 8 24 8C30.627 8 36 14.268 36 22V44"
        stroke="#f59e0b"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path d="M12 44H36" stroke="#f59e0b" strokeWidth="3.2" strokeLinecap="round" />
      <path
        d="M24 4C21.5 8.5 26 9.5 24.5 13C23.2 15.9 20 14 20.3 10.8C18.6 13 18.8 17 22.2 18C25.9 19 27.6 15.2 26.1 12.2C28.8 13.3 29.3 17 27 19.2C31 18 32.2 12.8 29.4 9.6C31.7 9.8 32.6 12 32.1 14C33.8 10.6 31.6 6 27.4 5.2C28.4 6.8 28 8.4 27 9C27.3 6.4 25.8 4.6 24 4Z"
        fill="#fbbf24"
      />
    </svg>
  );
}
