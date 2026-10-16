REVOKE EXECUTE ON FUNCTION public.upsert_content_snapshot(TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_content_snapshot(TEXT, UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_content_snapshot(TEXT, UUID, TEXT, TEXT) TO authenticated;