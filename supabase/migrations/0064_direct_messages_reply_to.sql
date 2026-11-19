-- Reply-to support for direct messages
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid
  REFERENCES public.direct_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS direct_messages_reply_to_message_id_idx
  ON public.direct_messages (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;
