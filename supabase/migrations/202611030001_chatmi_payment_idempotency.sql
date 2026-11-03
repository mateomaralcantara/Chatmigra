-- ChatMi: a PayPal capture can be recorded at most once.
-- The capture endpoint already checks for an existing row before inserting;
-- this index makes the guarantee hold even under concurrent retries.
-- If this fails with "could not create unique index", duplicate rows already
-- exist: review them with
--   select provider_capture_id, count(*) from public.payments
--   where provider_capture_id is not null group by 1 having count(*) > 1;
-- and remove the extra copies manually before re-running.

create unique index if not exists payments_provider_capture_id_key
  on public.payments (provider_capture_id)
  where provider_capture_id is not null;
