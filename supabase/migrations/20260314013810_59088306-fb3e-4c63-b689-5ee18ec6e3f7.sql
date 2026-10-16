
-- Create user_plans table
CREATE TABLE public.user_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'beginner',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_user_plan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.plan NOT IN ('beginner', 'storyteller') THEN
    RAISE EXCEPTION 'Invalid plan: %. Must be beginner or storyteller.', NEW.plan;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_plan_before_insert_update
  BEFORE INSERT OR UPDATE ON public.user_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_user_plan();

-- Add updated_at trigger
CREATE TRIGGER update_user_plans_updated_at
  BEFORE UPDATE ON public.user_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;

-- Users can read their own plan
CREATE POLICY "Users can view own plan"
  ON public.user_plans FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all plans
CREATE POLICY "Admins can view all plans"
  ON public.user_plans FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update all plans
CREATE POLICY "Admins can update all plans"
  ON public.user_plans FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Security definer function to get a user's plan
CREATE OR REPLACE FUNCTION public.get_user_plan(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT plan FROM public.user_plans WHERE user_id = _user_id),
    'beginner'
  )
$$;

-- Extend handle_new_user to also insert a beginner plan
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id);
  INSERT INTO public.user_plans (user_id, plan) VALUES (NEW.id, 'beginner');
  RETURN NEW;
END;
$$;

-- Backfill existing users who don't have a plan row
INSERT INTO public.user_plans (user_id, plan)
SELECT p.user_id, 'beginner'
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_plans up WHERE up.user_id = p.user_id
);
