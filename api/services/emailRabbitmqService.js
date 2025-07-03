const amqp = require('amqplib');
const sendAcceptChannelRequest = require('../../coms/acceptChannel/sendAcceptChannelRequest');

const EMAIL_EXCHANGE = 'email_send_direct';
const QUEUE_NAME = 'email_accept_request_queue';
const ROUTING_KEY = 'accept_channel_request';

const RABBITMQ_CONFIG = {
  protocol: 'amqp',
  hostname: process.env.RABBITMQ_HOST || 'localhost',
  port: process.env.RABBITMQ_PORT || 5672,
  username: process.env.RABBITMQ_USER || 'admin',
  password: process.env.RABBITMQ_PASS || 'admin123',
  vhost: process.env.RABBITMQ_VHOST || '/',
  heartbeat: 60
};

class RabbitMQEmailService {
  constructor() {
    this.connection = null;
    this.channel = null;
  }

  async connect() {
    if (!this.connection) {
      this.connection = await amqp.connect(RABBITMQ_CONFIG);
      this.channel = await this.connection.createChannel();

      await this.channel.assertExchange(EMAIL_EXCHANGE, 'direct', { durable: true });
      await this.channel.assertQueue(QUEUE_NAME, { durable: true });
      await this.channel.bindQueue(QUEUE_NAME, EMAIL_EXCHANGE, ROUTING_KEY);
    }
  }

  async sendEmailMessage({ to, channelId, channelName, username, logo,topicId="",topicName="",eventId="",eventName="" }) {
    await this.connect();
    const msg = { to, channelId, channelName, username, logo,topicId,topicName,eventId,eventName };
    this.channel.publish(
      EMAIL_EXCHANGE,
      ROUTING_KEY,
      Buffer.from(JSON.stringify(msg)),
      { persistent: true }
    );
    console.log('[Email MQ] Message published for:', to);
  }

  async startConsumer() {
    await this.connect();

    console.log('[Email MQ] Waiting for messages...');

    this.channel.consume(QUEUE_NAME, async (msg) => {
      if (msg !== null) {
        try {
          const data = JSON.parse(msg.content.toString());
          await sendAcceptChannelRequest(data.to, data.channelId, data.channelName, data.username, data.logo,data.topicId,data.topicName,data.eventId,data.eventName);
          this.channel.ack(msg);
        } catch (error) {
          console.error('[Email MQ] Error processing message:', error);
          this.channel.nack(msg, false, false); // discard bad message
        }
      }
    });
  }
}

// Usage
const emailRabbitmqService = new RabbitMQEmailService();
emailRabbitmqService.startConsumer();

module.exports = emailRabbitmqService;
