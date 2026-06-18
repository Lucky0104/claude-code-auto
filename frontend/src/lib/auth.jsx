import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { api } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTenantId, setActiveTenantId] = useState(localStorage.getItem("dashai_tid"));

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setMe(data);
      const tid = activeTenantId || data.active_tenant_id || data.tenants?.[0]?.id || null;
      if (tid && tid !== activeTenantId) {
        localStorage.setItem("dashai_tid", tid);
        setActiveTenantId(tid);
      }
    } catch (e) {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, [activeTenantId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch (e) { /* ignore */ }
    localStorage.removeItem("dashai_tid");
    window.location.href = "/login";
  }, []);

  const switchTenant = useCallback(async (tid) => {
    await api.post(`/auth/switch/${tid}`);
    localStorage.setItem("dashai_tid", tid);
    setActiveTenantId(tid);
    await refresh();
  }, [refresh]);

  const activeTenant = me?.tenants?.find((t) => t.id === activeTenantId);

  const value = useMemo(
    () => ({ me, loading, activeTenant, activeTenantId, refresh, logout, switchTenant }),
    [me, loading, activeTenant, activeTenantId, refresh, logout, switchTenant]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
