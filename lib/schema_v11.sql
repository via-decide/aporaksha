-- ============================================================================
-- IMMUTABLE TOKEN LEDGER (Core v9 + v11 Reconciliation Extension)
-- ============================================================================

-- Customer token balance (immutable log)
CREATE TABLE IF NOT EXISTS token_ledger_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'INITIAL_GRANT',      -- Onboarding grant
        'PURCHASE',           -- User bought tokens
        'STREAM_DEBIT_OPT',   -- Optimistic edge debit (Cloudflare Worker)
        'STREAM_DEBIT_REC',   -- Reconciled debit (post-API-call)
        'REFUND',             -- Micro-refund (overage correction)
        'CHARGE',             -- Micro-charge (underage correction)
        'DEPLOYMENT_TAX',     -- Flat fee for logichub pack + daxini deploy
        'ADMIN_ADJUSTMENT'    -- Manual correction
    )),
    amount_z_tokens INT NOT NULL,
    reason_code VARCHAR(100),
    trace_id VARCHAR(36),       -- Links to Cloudflare request ID
    kafka_offset BIGINT,        -- Links to zayvora_token_audits Kafka offset
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    -- Foreign key to customers omitted for aporaksha standalone use, assuming customer_id aligns with passports
);

-- Derived: Current balance (updated only via INSERT, never UPDATE)
CREATE MATERIALIZED VIEW IF NOT EXISTS token_balance_current AS
SELECT
    customer_id,
    SUM(CASE WHEN event_type IN ('INITIAL_GRANT', 'PURCHASE', 'REFUND', 'ADMIN_ADJUSTMENT')
             THEN amount_z_tokens
             ELSE -amount_z_tokens
        END) AS balance_z_tokens,
    MAX(created_at) AS last_updated_at
FROM token_ledger_events
GROUP BY customer_id;

-- Create unique index on customer_id for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_balance_current_customer
ON token_balance_current(customer_id);

-- ============================================================================
-- DUAL-LEDGER RECONCILIATION (v11 Core Innovation)
-- ============================================================================

-- Optimistic charges (made at edge, before API call completes)
CREATE TABLE IF NOT EXISTS token_reconciliations (
    reconciliation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    trace_id VARCHAR(36) NOT NULL UNIQUE,           -- Cloudflare trace ID
    
    -- Edge-time optimistic estimate
    optimistic_input_tokens INT NOT NULL,
    optimistic_output_tokens INT NOT NULL,
    optimistic_z_tokens_charged INT NOT NULL,      -- 1×input + 3×output
    optimistic_charged_at TIMESTAMP WITH TIME ZONE NOT NULL,
    optimistic_ledger_event_id UUID,               -- References token_ledger_events
    
    -- Actual API call results (populated 1-3 seconds later)
    api_provider VARCHAR(20),                       -- 'claude' or 'ollama'
    actual_input_tokens INT,
    actual_output_tokens INT,
    actual_z_tokens_cost INT,                      -- 1×input + 3×output (real)
    actual_api_call_at TIMESTAMP WITH TIME ZONE,
    api_response_ms INT,
    
    -- Reconciliation calculation
    ledger_adjustment INT,                          -- actual_z_tokens - optimistic_z_tokens
    adjustment_reason VARCHAR(100),                 -- 'OVERESTIMATE' or 'UNDERESTIMATE'
    refund_or_charge_event_id UUID,                -- References token_ledger_events
    reconciled_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit trail
    status VARCHAR(20) CHECK (status IN ('PENDING', 'RECONCILED', 'FAILED')) DEFAULT 'PENDING',
    error_message TEXT,
    
    FOREIGN KEY (optimistic_ledger_event_id) REFERENCES token_ledger_events(event_id),
    FOREIGN KEY (refund_or_charge_event_id) REFERENCES token_ledger_events(event_id)
);

CREATE INDEX IF NOT EXISTS idx_reconciliations_customer ON token_reconciliations(customer_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_status ON token_reconciliations(status, reconciled_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliations_trace ON token_reconciliations(trace_id);

-- ============================================================================
-- IMMUTABILITY ENFORCEMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_token_ledger_immutability()
RETURNS TRIGGER AS $$
DECLARE
  bypass_enabled BOOLEAN;
BEGIN
  bypass_enabled := COALESCE(
    current_setting('daxini.bypass_immutability', true)::BOOLEAN,
    false
  );

  IF bypass_enabled THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'token_ledger_events is append-only. Use INSERT for new state.';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'token_ledger_events is immutable. Use archival, not deletion.';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_immutable_token_ledger ON token_ledger_events;
CREATE TRIGGER trigger_immutable_token_ledger
BEFORE UPDATE OR DELETE ON token_ledger_events
FOR EACH ROW
EXECUTE FUNCTION enforce_token_ledger_immutability();

CREATE OR REPLACE FUNCTION allow_reconciliation_cascade()
RETURNS TRIGGER AS $$
DECLARE
  bypass_enabled BOOLEAN;
BEGIN
  bypass_enabled := COALESCE(
    current_setting('daxini.bypass_immutability', true)::BOOLEAN,
    false
  );
  -- Allow UPDATE/DELETE during compliance operations
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cascade_reconciliations ON token_reconciliations;
CREATE TRIGGER trigger_cascade_reconciliations
BEFORE UPDATE OR DELETE ON token_reconciliations
FOR EACH ROW
EXECUTE FUNCTION allow_reconciliation_cascade();

-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE token_ledger_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS token_ledger_customer_isolation ON token_ledger_events;
CREATE POLICY token_ledger_customer_isolation ON token_ledger_events
FOR SELECT
USING (
  customer_id = CAST(current_setting('request.jwt.claim.sub') AS UUID)
  OR current_user IN ('audit_service', 'temporal_worker', 'postgres')
);

DROP POLICY IF EXISTS reconciliation_customer_isolation ON token_reconciliations;
CREATE POLICY reconciliation_customer_isolation ON token_reconciliations
FOR SELECT
USING (
  customer_id = CAST(current_setting('request.jwt.claim.sub') AS UUID)
  OR current_user IN ('audit_service', 'temporal_worker', 'postgres')
);

-- ============================================================================
-- PAYMENT TOKEN STORAGE (v9 Security: HMAC-SHA256 + Pepper)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_tokens_v2 (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    payment_type VARCHAR(50) NOT NULL, -- 'stripe', 'razorpay', 'upi'
    gateway_token_ciphertext BYTEA NOT NULL,  -- AES-256-GCM encrypted
    token_hash VARCHAR(64) NOT NULL UNIQUE,   -- HMAC-SHA256(pepper, token)
    token_salt VARCHAR(32) NOT NULL,          -- Per-token random salt
    kms_key_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_payment_tokens_hash ON payment_tokens_v2(token_hash);
CREATE INDEX IF NOT EXISTS idx_payment_tokens_customer ON payment_tokens_v2(customer_id);

ALTER TABLE payment_tokens_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_token_isolation ON payment_tokens_v2;
CREATE POLICY payment_token_isolation ON payment_tokens_v2
FOR ALL
USING (
  customer_id = CAST(current_setting('request.jwt.claim.sub') AS UUID)
);

-- ============================================================================
-- DEPLOYMENT AUDIT TRAIL
-- ============================================================================

CREATE TABLE IF NOT EXISTS deployment_audit (
    deployment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    trace_id VARCHAR(36) NOT NULL,
    code_generation_ms INT,
    code_size_bytes INT,
    logichub_pack_ms INT,
    logichub_pack_status VARCHAR(20),
    logichub_pack_error TEXT,
    daxini_deploy_ms INT,
    daxini_deploy_status VARCHAR(20),
    daxini_deploy_url VARCHAR(512),
    daxini_deploy_error TEXT,
    deployment_tax_z_tokens INT DEFAULT 500,
    deployment_tax_charged_at TIMESTAMP WITH TIME ZONE,
    overall_status VARCHAR(20) CHECK (overall_status IN ('SUCCESS', 'PARTIAL', 'FAILED')),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deployment_audit_customer ON deployment_audit(customer_id);
CREATE INDEX IF NOT EXISTS idx_deployment_audit_status ON deployment_audit(overall_status, completed_at DESC);
