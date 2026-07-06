ALTER TABLE sync_client_ops
  ADD COLUMN IF NOT EXISTS response_json JSONB;
