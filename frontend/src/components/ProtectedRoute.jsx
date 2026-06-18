import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function ProtectedRoute({ children, requireOnboarded = true }) {
  const { me, loading, activeTenant } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><span className="overline">Loading</span></div>;
  if (!me) return <Navigate to="/login" replace state={{ from: loc }} />;
  if (requireOnboarded && activeTenant && !activeTenant.onboarded) return <Navigate to="/onboarding" replace />;
  return children;
}
