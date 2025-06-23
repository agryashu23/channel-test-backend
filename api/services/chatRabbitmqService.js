const amqp = require('amqplib');
const redisService = require('./redisService');

const RABBITMQ_CONFIG = {
  protocol: 'amqp',
  hostname: process.env.RABBITMQ_HOST || 'localhost',
  port: process.env.RABBITMQ_PORT || 5672,
  username: process.env.RABBITMQ_USER || 'admin',
  password: process.env.RABBITMQ_PASS || 'admin123',
  vhost: process.env.RABBITMQ_VHOST || '/',
  heartbeat: 60
};

const RECONNECT_CONFIG = {
  retries: 10,
  delay: 5000
};

class RabbitMQService {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.queue = null;
    this.EXCHANGE_NAME = 'cache_invalidation_topic';
  }

  async checkConnection() {
    if (!this.connection) {
      await this.connect();
    }
    return this.connection && this.channel;
  }

  async connect() {
    const { retries, delay } = RECONNECT_CONFIG;

    for (let i = 0; i < retries; i++) {
      try {
        this.connection = await amqp.connect(RABBITMQ_CONFIG);
        this.channel = await this.connection.createChannel();
        await this.channel.assertExchange(this.EXCHANGE_NAME, 'topic', { durable: false });

        const queueResult = await this.channel.assertQueue('', { exclusive: true });
        this.queue = queueResult.queue;

        await this.channel.bindQueue(this.queue, this.EXCHANGE_NAME, '#'); 
        console.log('[RabbitMQ] Connected and waiting for invalidation messages...');

        this.setupMessageConsumer();
        break;
      } catch (err) {
        console.error(`[RabbitMQ] ❌ Connection attempt ${i + 1} failed:`, err.message);
        if (i === retries - 1) throw new Error('RabbitMQ connection failed after retries');
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  setupMessageConsumer() {
    if (!this.channel || !this.queue) {
      throw new Error('[RabbitMQ] Channel or queue not initialized');
    }

    this.channel.consume(this.queue, async (msg) => {
      if (msg !== null) {
        try {
          const { keys = [], type = 'unknown' } = JSON.parse(msg.content.toString());

          if (!Array.isArray(keys)) {
            console.warn(`[RabbitMQ] Invalid keys format`, keys);
            return this.channel.ack(msg);
          }

          for (const key of keys) {
            if (key.includes('*')) {
              await redisService.delPatternCache(key);
              // console.log(`[Cache Invalidated][Wildcard] Key Pattern: ${key}`);
            } else {
              await redisService.delCache(key);
              console.log(`[Cache Invalidated] Key: ${key}`);
            }
          }

          this.channel.ack(msg);
        } catch (error) {
          console.error('[RabbitMQ] Failed to process message:', error);
          this.channel.nack(msg, false, false);
        }
      }
    });
  }

  async publishInvalidation(keys, type = 'general', routingKey = '') {
    try {
      if (!await this.checkConnection()) {
        throw new Error('[RabbitMQ] Not connected');
      }

      const payload = {
        keys: Array.isArray(keys) ? keys : [keys],
        type,
      };

      this.channel.publish(
        this.EXCHANGE_NAME,
        routingKey || 'cache.invalidate.general',
        Buffer.from(JSON.stringify(payload))
      );

      // console.log(`[RabbitMQ] Published invalidation [${type}] to [${routingKey}] for keys:`, payload.keys);
    } catch (error) {
      console.error('[RabbitMQ] Publish Error:', error);
      throw error;
    }
  }

  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.queue = null;
      console.log('[RabbitMQ] Connection closed');
    } catch (error) {
      console.error('[RabbitMQ] Close Error:', error);
      throw error;
    }
  }
}

module.exports = new RabbitMQService();
