const amqp = require('amqplib');
const redisService = require('./redisService');
const Redis = require('ioredis');

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
  delay: 5000 // 5 seconds delay between retries
};

class RabbitMQService {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.queue = null;
    this.EXCHANGE_NAME = 'cache_invalidation_fanout';
  }

  async checkConnection() {
    try {
      if (!this.connection) {
        await this.connect();
      }
      return this.connection && this.channel;
    } catch (error) {
      console.error('[RabbitMQ] Check Connection Error:', error);
      return false;
    }
  }

  async connect() {
    try {
      const { retries, delay } = RECONNECT_CONFIG;
      
      for (let i = 0; i < retries; i++) {
        try {
          this.connection = await amqp.connect(RABBITMQ_CONFIG);
          this.channel = await this.connection.createChannel();
          await this.channel.assertExchange(this.EXCHANGE_NAME, 'fanout', { durable: false });
          
          const queueResult = await this.channel.assertQueue('', { exclusive: true });
          this.queue = queueResult.queue;
          
          await this.channel.bindQueue(this.queue, this.EXCHANGE_NAME, '');
          console.log('[RabbitMQ] Connected and waiting for invalidation messages...');
          
          this.setupMessageConsumer();
          break;
        } catch (err) {
          console.error(`[RabbitMQ] ❌ Connection attempt ${i + 1} failed:`, err.message);
          if (i === retries - 1) throw new Error('RabbitMQ connection failed after retries');
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    } catch (error) {
      console.error('[RabbitMQ] Connection Error:', error);
      throw error;
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
            console.warn(`[RabbitMQ] Received invalid keys format:`, keys);
            return this.channel.ack(msg);
          }

          for (const key of keys) {
            await redisService.delCache(key);
            // console.log(`[Cache Invalidated][Type: ${type}] Key: ${key}`);
          }

          this.channel.ack(msg);
        } catch (error) {
          console.error('[RabbitMQ] Failed to process message:', error);
          // Nack the message if processing failed
          this.channel.nack(msg, false, false);
        }
      }
    });
  }

  async publishInvalidation(keys, type = 'general') {
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
        '', 
        Buffer.from(JSON.stringify(payload))
      );

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

const rabbitmqService = new RabbitMQService();
module.exports = rabbitmqService;
