-- Distinguish author-defined interactions from AI-generated ones. The AI draft
-- pipeline uses this to guarantee the author's own polls/quizzes are always
-- woven into a (re)generated article and never pruned, while still pruning the
-- stale interactions it generated for an earlier draft of the same post.
--
-- Existing rows default to 'author' (the safe side: they'll be preserved across
-- regenerates rather than silently dropped).
alter table public.interactions
  add column if not exists source text not null default 'author'
  check (source in ('author', 'ai'));
