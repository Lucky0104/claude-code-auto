import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { OrgProvider } from '@/components/OrgContext';
import { OrgSwitcher } from '@/components/OrgSwitcher';
import { SignOutButton } from '@/components/SignOutButton';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: memberships } = await supabase
    .from('user_organizations')
    .select('role, organizations(id, name, slug, phone_number)')
    .eq('user_id', user.id);

  const orgs = (memberships ?? [])
    .map((m) => {
      const org = m.organizations as unknown as {
        id: string;
        name: string;
        slug: string;
        phone_number: string;
      } | null;
      return org ? { ...org, role: m.role } : null;
    })
    .filter((o): o is NonNullable<typeof o> => o !== null);

  if (!orgs.length) redirect('/onboarding');

  const nav = [
    { href: '/', label: 'Dashboard' },
    { href: '/comments', label: 'Comments' },
    { href: '/orm', label: 'ORM Rules' },
    { href: '/settings', label: 'Settings' },
    { href: '/team', label: 'Team' },
  ];

  return (
    <OrgProvider orgs={orgs}>
      <div className="flex min-h-screen">
        <aside className="flex w-56 flex-col border-r bg-card">
          <div className="border-b p-4">
            <h1 className="text-lg font-bold">MBS Auto-Reply</h1>
            <OrgSwitcher />
          </div>
          <nav className="flex-1 space-y-1 p-3">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="border-t p-3">
            <p className="mb-2 truncate px-3 text-xs text-muted-foreground">{user.email}</p>
            <SignOutButton />
          </div>
        </aside>
        <main className="flex-1 overflow-auto bg-muted/20 p-6">{children}</main>
      </div>
    </OrgProvider>
  );
}
