
REVOKE ALL ON FUNCTION public.clone_project_for_user(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.seed_new_user_from_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clone_project_for_user(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_new_user_from_template(uuid) TO service_role;
