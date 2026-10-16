-- Restrict who can read shared_with_email so owners (and any other authenticated user)
-- can no longer enumerate platform email addresses via share records.
-- The invitee themselves does not need to read this column back (they already know
-- their own email), and the accept-pending-invitations edge function uses the
-- service role, which is unaffected by these grants.

REVOKE SELECT (shared_with_email) ON public.project_shares FROM authenticated;
REVOKE SELECT (shared_with_email) ON public.project_shares FROM anon;

REVOKE SELECT (shared_with_email) ON public.canvas_shares FROM authenticated;
REVOKE SELECT (shared_with_email) ON public.canvas_shares FROM anon;

-- Owners need a way to avoid creating duplicate invites for the same email.
-- A unique constraint lets the database enforce that without exposing the column.
ALTER TABLE public.project_shares
  ADD CONSTRAINT project_shares_project_id_shared_with_email_key
  UNIQUE (project_id, shared_with_email);
