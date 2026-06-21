import { v4 as uuidv4 } from 'uuid';
import { pgPool } from './tenantSafeDb.js';
import { Kafka } from 'kafkajs';

const kafka = new Kafka({ brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'] });
const kafkaProducer = kafka.producer();

/**
 * Fix #3: GDPR-Safe Immutability
 * Right-to-Be-Forgotten deletion with session-level immutability bypass
 */
export async function executeGDPRDeletion(customerId) {
  const client = await pgPool.connect();

  try {
    await client.query('BEGIN');

    // Enable immutability bypass strictly for this session/transaction
    await client.query(`SET LOCAL daxini.bypass_immutability = true`);

    const deletionLogId = uuidv4();
    await client.query(
      `INSERT INTO gdpr_deletion_logs (deletion_id, customer_id, status, initiated_at)
       VALUES ($1, $2, $3, NOW())`,
      [deletionLogId, customerId, 'IN_PROGRESS']
    );

    await client.query(
      `INSERT INTO customer_deletion_archive (customer_id, archived_data, archived_at)
       SELECT $1, row_to_json(row(customer_id, email, phone_number)), NOW()
       FROM customers WHERE customer_id = $1`,
      [customerId]
    );

    // CASCADE delete is allowed because bypass is set locally
    await client.query(`DELETE FROM customers WHERE customer_id = $1`, [customerId]);

    await client.query(
      `UPDATE gdpr_deletion_logs SET status = $1, completed_at = NOW() WHERE deletion_id = $2`,
      ['COMPLETED', deletionLogId]
    );

    await client.query('COMMIT');
    console.log(`[GDPR] Customer ${customerId} deleted successfully`);

    await kafkaProducer.connect();
    await kafkaProducer.send({
      topic: 'compliance-events',
      messages: [{
        key: customerId,
        value: JSON.stringify({
          event_id: uuidv4(),
          event_type: 'GDPR_DELETION_COMPLETED',
          customer_id: customerId,
          deletion_log_id: deletionLogId,
          timestamp: new Date().toISOString()
        })
      }]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[GDPR] Deletion failed for ${customerId}:`, error);
    throw error;
  } finally {
    client.release();
    await kafkaProducer.disconnect();
  }
}
