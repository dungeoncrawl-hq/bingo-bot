// The site's mark -- next to the "Dungeon Crawl" wordmark in Header.tsx
// and standalone in HomePage.tsx's hero. Served as a static asset
// (public/logo.svg -- same artwork as public/favicon.svg) rather than
// inlined, since the source file is a few thousand hand-authored path
// segments (a host-supplied vector, not something to hand-maintain as
// JSX) -- an <img> keeps that weight out of the JS bundle entirely.
export default function Logo({ size = 28 }: { size?: number }) {
  return <img src="/logo.svg" alt="" width={size} height={size} className="shrink-0" />;
}
