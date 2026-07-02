'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export interface OrgWithRole {
  id: string;
  name: string;
  slug: string;
  phone_number: string;
  role: string;
}

interface OrgContextValue {
  orgs: OrgWithRole[];
  currentOrg: OrgWithRole;
  setCurrentOrgId: (id: string) => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);

const STORAGE_KEY = 'mbs-current-org';

export function OrgProvider({
  orgs,
  children,
}: {
  orgs: OrgWithRole[];
  children: React.ReactNode;
}) {
  const [currentOrgId, setCurrentOrgIdState] = useState<string>(orgs[0].id);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && orgs.some((o) => o.id === saved)) {
      setCurrentOrgIdState(saved);
    }
  }, [orgs]);

  function setCurrentOrgId(id: string) {
    localStorage.setItem(STORAGE_KEY, id);
    setCurrentOrgIdState(id);
  }

  const currentOrg = orgs.find((o) => o.id === currentOrgId) ?? orgs[0];

  return (
    <OrgContext.Provider value={{ orgs, currentOrg, setCurrentOrgId }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used inside OrgProvider');
  return ctx;
}
