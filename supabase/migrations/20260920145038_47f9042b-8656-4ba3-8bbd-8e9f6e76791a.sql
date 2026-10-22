-- Map stickers: reads follow the public bucket (needed for shared/public maps);
-- writes stay restricted to the owner's own folder.
DROP POLICY IF EXISTS "map-stickers user read" ON storage.objects;
CREATE POLICY "map-stickers public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'map-stickers');

-- Credit balances are mutated only by the hardened, server-only SECURITY DEFINER
-- functions. Make that explicit so no client role can write directly.
REVOKE INSERT, UPDATE, DELETE ON public.user_credits FROM anon, authenticated;
GRANT SELECT ON public.user_credits TO authenticated;
GRANT ALL ON public.user_credits TO service_role;

DROP POLICY IF EXISTS "no direct credit inserts" ON public.user_credits;
CREATE POLICY "no direct credit inserts"
  ON public.user_credits FOR INSERT TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "no direct credit updates" ON public.user_credits;
CREATE POLICY "no direct credit updates"
  ON public.user_credits FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "no direct credit deletes" ON public.user_credits;
CREATE POLICY "no direct credit deletes"
  ON public.user_credits FOR DELETE TO authenticated, anon
  USING (false);