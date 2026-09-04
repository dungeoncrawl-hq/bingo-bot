import { Link } from 'react-router-dom';

export default function UnsubscribedPage() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-2xl font-semibold">Unsubscribed</h1>
      <p className="mt-4 text-stone-400">
        You won't get any more update emails from Dungeon Crawl. You can turn them back on anytime from your{' '}
        <Link to="/account" className="text-amber-500 hover:underline">
          account page
        </Link>
        .
      </p>
    </div>
  );
}
