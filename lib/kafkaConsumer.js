import { Kafka, logLevel } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import { Upload } from '@aws-sdk/lib-storage';
import { S3Client } from '@aws-sdk/client-s3';
import fs from 'fs';
import parquetjs from 'parquetjs';
import { pgPool } from './tenantSafeDb.js';

// Simulated Parquet schema
const BillingEventSchema = new parquetjs.ParquetSchema({
  event_id: { type: 'UTF8' },
  subscription_id: { type: 'UTF8' },
  customer_id: { type: 'UTF8' },
  amount_inr: { type: 'INT32' },
  created_at: { type: 'UTF8' }
});

export class BillingArchiveConsumer {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'billing-archive-v9',
      brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
      logLevel: logLevel.WARN,
      ssl: process.env.KAFKA_SECURITY_PROTOCOL === 'SASL_SSL'
    });

    this.consumer = this.kafka.consumer({
      groupId: 'billing-archive-consumer-v9',
      sessionTimeout: 60000,
      heartbeatInterval: 3000,
      maxBytesPerPartition: 1048576,
      allowAutoTopicCreation: false
    });

    this.currentBatch = [];
    this.currentOffsets = new Map();
    this.batchId = uuidv4();
    this.BATCH_SIZE = 10000;
    this.BATCH_TIMEOUT_MS = 30000;
    this.batchTimer = null;
  }

  async start() {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: 'billing-events', fromBeginning: false });

    console.log('[KafkaArchiver] Subscribed to billing-events (AutoCommit Disabled)');

    await this.consumer.run({
      autoCommit: false, // Fix #2: Manual Commit
      eachMessage: async ({ topic, partition, message }) => {
        try {
          await this.handleMessage(partition, message);
        } catch (error) {
          console.error(`[KafkaArchiver] Message processing failed:`, error);
          throw error;
        }
      },
      eachPartition: async ({ partition }) => {
        const offset = await this.consumer.committed('billing-events', partition);
        const startingOffset = offset ? String(BigInt(offset.offset) + 1n) : '0';
        await partition.seek(startingOffset);
      }
    });
  }

  async handleMessage(partition, message) {
    const event = JSON.parse(message.value?.toString() || '{}');
    if (!event.event_id) return; // Basic validation

    this.currentOffsets.set(partition, parseInt(message.offset));
    this.currentBatch.push(event);

    if (this.currentBatch.length >= this.BATCH_SIZE) {
      await this.flushBatch();
    } else {
      this.resetBatchTimer();
    }
  }

  async flushBatch() {
    if (this.currentBatch.length === 0) return;

    const batchId = this.batchId;
    const batchSize = this.currentBatch.length;
    console.log(`[KafkaArchiver] Flushing batch ${batchId} with ${batchSize} events`);

    try {
      const parquetPath = await this.writeParquetBatch(batchId, this.currentBatch);
      const s3Location = await this.uploadToS3(batchId, parquetPath);
      await this.recordBatchInDatabase(batchId, s3Location, batchSize);
      await this.commitOffsets(); // Commit only after S3 upload

      this.currentBatch = [];
      this.currentOffsets.clear();
      this.batchId = uuidv4();
    } catch (error) {
      console.error(`[KafkaArchiver] Batch ${batchId} failed (will retry on restart):`, error);
      throw error;
    }
  }

  async writeParquetBatch(batchId, events) {
    const path = `/tmp/billing-batch-${batchId}.parquet`;
    const writer = await parquetjs.ParquetWriter.openFile(BillingEventSchema, path, { compression: 'SNAPPY' });
    for (const event of events) { await writer.appendRow(event); }
    await writer.close();
    return path;
  }

  async uploadToS3(batchId, filePath) {
    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    const s3Key = `billing-archive-v9/${new Date().toISOString().split('T')[0]}/batch-${batchId}.parquet`;
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: 'daxini-billing-archive',
        Key: s3Key,
        Body: fs.createReadStream(filePath),
        ServerSideEncryption: 'AES256',
        Metadata: { 'batch-id': batchId }
      }
    });
    await upload.done();
    return `s3://daxini-billing-archive/${s3Key}`;
  }

  async recordBatchInDatabase(batchId, s3Location, eventCount) {
    await pgPool.query(
      `INSERT INTO kafka_batch_uploads (batch_id, s3_location, event_count, uploaded_at)
       VALUES ($1, $2, $3, NOW()) ON CONFLICT (batch_id) DO NOTHING`,
      [batchId, s3Location, eventCount]
    );
  }

  async commitOffsets() {
    const topicPartitions = Array.from(this.currentOffsets.entries()).map(([partition, offset]) => ({
      topic: 'billing-events',
      partition,
      offset: String(offset + 1)
    }));
    if (topicPartitions.length > 0) {
      await this.consumer.commitOffsets(topicPartitions);
    }
  }

  resetBatchTimer() {
    if (this.batchTimer) clearTimeout(this.batchTimer);
    this.batchTimer = setTimeout(async () => {
      if (this.currentBatch.length > 0) await this.flushBatch();
    }, this.BATCH_TIMEOUT_MS);
  }

  async stop() {
    if (this.batchTimer) clearTimeout(this.batchTimer);
    if (this.currentBatch.length > 0) await this.flushBatch();
    await this.consumer.disconnect();
  }
}
