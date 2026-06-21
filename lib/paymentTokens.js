import crypto from 'crypto';
import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { pgPool } from './tenantSafeDb.js';

/**
 * Fix #5: Token Hash Security (HMAC + Pepper)
 */
export class PaymentTokenManager {
  constructor() {
    this.pepper = process.env.PAYMENT_HASH_PEPPER;
    if (!this.pepper) {
      console.warn('PAYMENT_HASH_PEPPER missing! Using fallback for development only.');
      this.pepper = 'dev-fallback-pepper-do-not-use-in-prod';
    }
  }

  generateTokenHash(gatewayToken) {
    return crypto.createHmac('sha256', this.pepper).update(gatewayToken).digest('hex');
  }

  async storePaymentToken(customerId, gatewayToken, paymentType) {
    const tokenSalt = crypto.randomBytes(16).toString('hex');
    const encrypted = await this.encryptToken(gatewayToken, tokenSalt);
    const tokenHash = this.generateTokenHash(gatewayToken);

    const result = await pgPool.query(
      `INSERT INTO payment_tokens_v2 
       (customer_id, payment_type, gateway_token_ciphertext, token_hash, token_salt, kms_key_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (token_hash) DO UPDATE SET last_used_at = NOW()
       RETURNING token_id`,
      [customerId, paymentType, encrypted.ciphertext, tokenHash, tokenSalt, encrypted.kmsKeyId]
    );

    return result.rows[0].token_id;
  }

  async encryptToken(token, salt) {
    const kmsClient = new KMSClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const kmsKeyId = process.env.AWS_KMS_KEY_ID || 'alias/local-dev-key';

    let dataKey;
    if (process.env.NODE_ENV === 'production') {
      const keyResponse = await kmsClient.send(new GenerateDataKeyCommand({ KeyId: kmsKeyId, KeySpec: 'AES_256' }));
      dataKey = keyResponse.Plaintext;
    } else {
      dataKey = crypto.randomBytes(32); // Mock for local
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv);
    let encrypted = cipher.update(token, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();

    const cipherBlob = Buffer.concat([
      Buffer.from(salt, 'hex'), iv, authTag, encrypted
    ]).toString('base64');

    return { ciphertext: cipherBlob, kmsKeyId };
  }
}
