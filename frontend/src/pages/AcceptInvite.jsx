import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function AcceptInvite() {
  const { token } = useParams();
  const { me, loading } = useAuth();
  const [status, setStatus] = useState("Joining…");
  const ran = useRef(false);

  useEffect(() => {
    if (loading || ran.current) return;
    ran.current = true;
    if (!me) {
      sessionStorage.setItem("dashai_invite_pending", token);
      window.location.href = "/login";
      return;
    }
    api
      .post(`/team/accept/${token}`)
      .then(({ data }) => {
        localStorage.setItem("dashai_tid", data.tenant_id);
        setStatus("Joined! Redirecting…");
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 600);
      })
      .catch((e) => {
        const detail = e?.response?.data?.detail || "Invite invalid";
        setStatus(detail);
      });
  }, [token, me, loading]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="overline">{status}</span>
    </div>
  );
}
