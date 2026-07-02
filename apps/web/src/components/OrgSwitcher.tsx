'use client';

import { useOrg } from './OrgContext';

export function OrgSwitcher() {
  const { orgs, currentOrg, setCurrentOrgId } = useOrg();

  if (orgs.length === 1) {
    return <p className="mt-1 truncate text-sm text-muted-foreground">{currentOrg.name}</p>;
  }

  return (
    <select
      value={currentOrg.id}
      onChange={(e) => setCurrentOrgId(e.target.value)}
      className="mt-2 w-full rounded-md border bg-background px-2 py-1 text-sm"
    >
      {orgs.map((org) => (
        <option key={org.id} value={org.id}>
          {org.name}
        </option>
      ))}
    </select>
  );
}
