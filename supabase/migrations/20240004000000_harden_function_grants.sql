-- RLS helper functions are only evaluated inside policies for signed-in
-- users; anon has no reason to call them via the RPC API.
REVOKE EXECUTE ON FUNCTION user_org_ids() FROM anon, public;
REVOKE EXECUTE ON FUNCTION user_role_in_org(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION user_org_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION user_role_in_org(UUID) TO authenticated;
