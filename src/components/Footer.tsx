import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-stone-800 px-6 py-4 text-center text-xs text-stone-600">
      <Link to="/about" className="hover:text-stone-400">
        About us
      </Link>
    </footer>
  );
}
