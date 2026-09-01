// Required attribution for the free-tier stone-texture tile background
// (see public/stone-texture.jpg) -- Magnific's license requires the line
// "Designed by Magnific" with a link to magnific.com, in a clear but not
// necessarily prominent spot; the site footer is their own suggested
// placement for a website. https://www.magnific.com/ai/docs/licenses-attribution
export default function Footer() {
  return (
    <footer className="border-t border-stone-800 px-6 py-4 text-center text-xs text-stone-600">
      Tile background — Designed by{' '}
      <a href="https://www.magnific.com" target="_blank" rel="noopener noreferrer" className="hover:text-stone-400">
        Magnific
      </a>
    </footer>
  );
}
