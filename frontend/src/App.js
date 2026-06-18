import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./lib/auth";
import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./components/AppShell";
import Login from "./pages/Login";
import OAuthSuccess from "./pages/OAuthSuccess";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import PagesPage from "./pages/Pages";
import Comments from "./pages/Comments";
import Approvals from "./pages/Approvals";
import Leads from "./pages/Leads";
import KnowledgeBase from "./pages/KnowledgeBase";
import Team from "./pages/Team";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import AcceptInvite from "./pages/AcceptInvite";
import AuditLogs from "./pages/AuditLogs";
import Campaigns from "./pages/Campaigns";

function Shell({ children }) { return <AppShell>{children}</AppShell>; }

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/oauth/success" element={<OAuthSuccess />} />
          <Route path="/accept-invite/:token" element={<AcceptInvite />} />
          <Route path="/onboarding" element={<ProtectedRoute requireOnboarded={false}><Onboarding /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Shell><Dashboard /></Shell></ProtectedRoute>} />
          <Route path="/pages" element={<ProtectedRoute><Shell><PagesPage /></Shell></ProtectedRoute>} />
          <Route path="/comments" element={<ProtectedRoute><Shell><Comments /></Shell></ProtectedRoute>} />
          <Route path="/approvals" element={<ProtectedRoute><Shell><Approvals /></Shell></ProtectedRoute>} />
          <Route path="/leads" element={<ProtectedRoute><Shell><Leads /></Shell></ProtectedRoute>} />
          <Route path="/knowledge" element={<ProtectedRoute><Shell><KnowledgeBase /></Shell></ProtectedRoute>} />
          <Route path="/team" element={<ProtectedRoute><Shell><Team /></Shell></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><Shell><Analytics /></Shell></ProtectedRoute>} />
          <Route path="/audit" element={<ProtectedRoute><Shell><AuditLogs /></Shell></ProtectedRoute>} />
          <Route path="/campaigns" element={<ProtectedRoute><Shell><Campaigns /></Shell></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Shell><Settings /></Shell></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
