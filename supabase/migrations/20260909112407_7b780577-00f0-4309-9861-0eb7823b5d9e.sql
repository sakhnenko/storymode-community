REVOKE EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.spend_credits(uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.spend_credits(uuid, integer, text, jsonb) TO service_role;