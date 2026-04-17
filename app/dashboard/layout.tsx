import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import Masthead from '@/components/masthead';
import PrimaryNav from '@/components/primary-nav';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Masthead user={user} />
      <PrimaryNav />
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
