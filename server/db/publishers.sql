-- Daxini Marketplace publishers and reputation schema

-- 1. Security Audits Table
CREATE TABLE IF NOT EXISTS security_audits (
  id UUID PRIMARY KEY,
  app_dir TEXT NOT NULL,
  audit_time TIMESTAMP NOT NULL,
  threat_score INTEGER NOT NULL CHECK (threat_score >= 0 AND threat_score <= 100),
  verdict TEXT NOT NULL,
  findings JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audits_app_dir ON security_audits(app_dir);
CREATE INDEX IF NOT EXISTS idx_audits_timestamp ON security_audits(audit_time DESC);

-- 2. Publishers Table
CREATE TABLE IF NOT EXISTS publishers (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  trust_score INTEGER DEFAULT 100 CHECK (trust_score >= 0 AND trust_score <= 100),
  deployments INTEGER DEFAULT 0,
  suspensions INTEGER DEFAULT 0,
  last_deployment_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'dormant', 'suspended')),
  last_activity_date TIMESTAMP,
  activity_type TEXT -- 'deploy', 'usage', 'report'
);

-- 3. Reputation Events Table
CREATE TABLE IF NOT EXISTS reputation_events (
  id UUID PRIMARY KEY,
  publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  audit_id UUID REFERENCES security_audits(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- WEEKLY DECAY CRON JOB RULES:
-- This job only decrements the trust score for publishers who are active
-- and have a history of actual deployments, preventing low-volume/dormant
-- but completely legitimate apps from decay.
--
-- SQL:
-- UPDATE publishers 
-- SET trust_score = trust_score - 1
-- WHERE status = 'active' 
--   AND last_deployment_at < now() - interval '30 days'
--   AND deployments > 0;
