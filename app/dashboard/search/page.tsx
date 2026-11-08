import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SearchClient } from './search-client';

export default async function SearchPage() {
  const user = await requireUser().catch(() => null);
  if (!user) redirect('/login');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Availability Search</h1>
      <p className="text-sm text-neutral-600 mb-6">
        Paste a restaurant URL, a listicle (like an Infatuation guide), or a list of names (one per line).
      </p>
      <SearchClient />
    </div>
  );
}
