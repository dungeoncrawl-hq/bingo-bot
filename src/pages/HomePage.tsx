import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export default function HomePage() {
  const { session } = useAuth();

  return (
    <div className="mx-auto max-w-2xl py-24 text-center">
      <h1 className="text-4xl font-bold">Dungeon Crawl</h1>
      <p className="mt-4 text-neutral-400">
        Host your own OSRS challenge board -- create it, invite your clan, track completions.
      </p>
      <div className="mt-8">
        <Link
          to={session ? '/new' : '/login'}
          className="rounded-lg bg-neutral-100 px-5 py-2.5 text-sm font-semibold text-neutral-950"
        >
          {session ? 'Create a challenge' : 'Get started'}
        </Link>
      </div>
    </div>
  );
}
