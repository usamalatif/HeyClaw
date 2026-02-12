-- Automation results: stores cron job run outputs for notification delivery
CREATE TABLE automation_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  job_name TEXT,
  result TEXT,
  run_at TIMESTAMP NOT NULL,
  seen BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_automation_user_unseen ON automation_results(user_id, seen) WHERE seen = false;
CREATE INDEX idx_automation_user_run ON automation_results(user_id, run_at);

-- RLS policies
ALTER TABLE automation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own automation results"
  ON automation_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role inserts automation results"
  ON automation_results FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users update own automation results"
  ON automation_results FOR UPDATE
  USING (auth.uid() = user_id);
