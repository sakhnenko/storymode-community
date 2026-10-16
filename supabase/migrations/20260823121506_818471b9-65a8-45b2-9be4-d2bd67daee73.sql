REVOKE ALL ON public.user_api_keys FROM anon;
REVOKE ALL ON public.user_api_keys FROM authenticated;
GRANT SELECT (id, user_id, openai_key_last4, created_at, updated_at) ON public.user_api_keys TO authenticated;
GRANT DELETE ON public.user_api_keys TO authenticated;
GRANT ALL ON public.user_api_keys TO service_role;