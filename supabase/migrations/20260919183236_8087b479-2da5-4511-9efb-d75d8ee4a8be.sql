CREATE OR REPLACE FUNCTION public.tmp_onboarding_chapter_html_to_markdown(_html text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(
    regexp_replace(
      replace(replace(replace(replace(replace(replace(
        regexp_replace(regexp_replace(regexp_replace(regexp_replace(
        regexp_replace(regexp_replace(regexp_replace(regexp_replace(
        regexp_replace(regexp_replace(regexp_replace(regexp_replace(
          replace(replace(replace(replace(_html,
            '<p>- ', '<p>\- '),
            '<p>+ ', '<p>\+ '),
            '<p># ', '<p>\# '),
            '<p>&gt;', '<p>\&gt;'),
          '<h1>(.*?)</h1>', E'\n\n# \\1\n\n', 'g'),
          '<h2>(.*?)</h2>', E'\n\n## \\1\n\n', 'g'),
          '<h3>(.*?)</h3>', E'\n\n### \\1\n\n', 'g'),
          '<li>(.*?)</li>', E'\n- \\1', 'g'),
          '<p>(.*?)</p>', E'\n\n\\1\n\n', 'g'),
          '<br>', E'\n', 'g'),
          '<hr>', E'\n\n---\n\n', 'g'),
          '<strong>(.*?)</strong>', '**\1**', 'g'),
          '<b>(.*?)</b>', '**\1**', 'g'),
          '<em>(.*?)</em>', '*\1*', 'g'),
          '<i>(.*?)</i>', '*\1*', 'g'),
          '<[^>]+>', '', 'g'),
        '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&nbsp;', ' '), '&amp;', '&'),
      E'\n{3,}', E'\n\n', 'g'),
    E'\n ');
$$;

UPDATE public.story_chapters AS c
SET content = public.tmp_onboarding_chapter_html_to_markdown(c.content)
WHERE c.project_id IN (SELECT project_id FROM public.user_onboarding WHERE project_id IS NOT NULL)
  AND c.content ~ '^\s*<(p|h[1-3]|ul|ol|blockquote)>';

UPDATE public.story_chapter_drafts AS d
SET content = public.tmp_onboarding_chapter_html_to_markdown(d.content)
FROM public.story_chapters AS c
WHERE d.chapter_id = c.id
  AND c.project_id IN (SELECT project_id FROM public.user_onboarding WHERE project_id IS NOT NULL)
  AND d.content ~ '^\s*<(p|h[1-3]|ul|ol|blockquote)>';

DROP FUNCTION public.tmp_onboarding_chapter_html_to_markdown(text);