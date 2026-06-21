import pg from 'pg';

const { Pool } = pg;

// Use environment variables for connection
export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * v11: TenantSafeDatabase
 * 
 * Enforces strict transaction boundaries + session variable cleanup
 * Prevents RLS context leaks across connection reuse
 */
export class TenantSafeDatabase {
  constructor(pool) {
    this.pool = pool;
    this.sessionVariable = 'request.jwt.claim.sub';
  }

  /**
   * Execute with strict tenant isolation
   * 
   * Guarantees:
   * - Tenant ID set inside transaction scope
   * - RLS enforced at DB level
   * - Variables auto-cleaned after COMMIT
   * - No cross-tenant leaks via connection reuse
   */
  async withTenantContext(customerId, callback) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');

      // Set tenant context INSIDE transaction (scope-local)
      await client.query(
        `SET LOCAL ${this.sessionVariable} = $1`,
        [customerId]
      );

      const result = await callback(client);
      await client.query('COMMIT');

      return result;

    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[TenantSafe] Rollback failed:', rollbackErr);
      }
      throw error;

    } finally {
      client.release();
    }
  }

  /**
   * Convenience: Query with tenant isolation
   */
  async query(customerId, sql, params = []) {
    return this.withTenantContext(customerId, async (client) => {
      return client.query(sql, params);
    });
  }

  /**
   * Transaction: Multi-statement with strict isolation
   */
  async transaction(customerId, callback) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await client.query(
        `SET LOCAL ${this.sessionVariable} = $1`,
        [customerId]
      );

      const result = await callback(client);
      await client.query('COMMIT');

      return result;

    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[TenantSafe] Rollback failed:', rollbackErr);
      }
      throw error;

    } finally {
      client.release();
    }
  }
}

// Export singleton
export const tenantDb = new TenantSafeDatabase(pgPool);
