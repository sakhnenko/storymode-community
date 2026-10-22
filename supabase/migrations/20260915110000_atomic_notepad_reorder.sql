-- Save a complete notebook reorder as one transaction. SECURITY INVOKER keeps
-- the existing notepads UPDATE policies authoritative for owners/collaborators.

CREATE OR REPLACE FUNCTION public.reorder_notepads(
  _grid_id uuid,
  _updates jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _expected integer;
  _updated integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _grid_id IS NULL OR jsonb_typeof(_updates) <> 'array' THEN
    RAISE EXCEPTION 'Invalid reorder';
  END IF;

  _expected := jsonb_array_length(_updates);
  IF _expected < 1 OR _expected > 500 THEN
    RAISE EXCEPTION 'Invalid reorder size';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(_updates) AS item(id uuid, col_index integer, row_index integer)
    WHERE item.id IS NULL
       OR item.col_index IS NULL
       OR item.row_index IS NULL
       OR item.col_index < 0
       OR item.row_index < 0
  ) THEN
    RAISE EXCEPTION 'Invalid reorder item';
  END IF;

  WITH requested AS (
    SELECT item.id, item.col_index, item.row_index
    FROM jsonb_to_recordset(_updates) AS item(id uuid, col_index integer, row_index integer)
  ), changed AS (
    UPDATE public.notepads AS notepad
    SET col_index = requested.col_index,
        row_index = requested.row_index
    FROM requested
    WHERE notepad.id = requested.id
      AND notepad.grid_id = _grid_id
    RETURNING notepad.id
  )
  SELECT count(*) INTO _updated FROM changed;

  -- Missing, duplicate, wrong-grid, or RLS-inaccessible IDs roll the entire
  -- statement back instead of leaving a partially reordered folio.
  IF _updated <> _expected THEN
    RAISE EXCEPTION 'Notepad reorder was incomplete';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_notepads(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_notepads(uuid, jsonb) TO authenticated;

-- Rollback: restore the client-side per-row updater before dropping
-- reorder_notepads(uuid, jsonb). No table or notebook data is changed by the
-- migration itself.
