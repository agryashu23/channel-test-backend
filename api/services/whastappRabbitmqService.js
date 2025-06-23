const amqp = require('amqplib');
require('dotenv').config();
const mongoose = require('mongoose');
const sendWhatsAppNotification = require('../../coms/whatsApp/whatsAppService');
const Channel = mongoose.model("Channel");
const Topic = mongoose.model("Topic");
const ChannelChat = mongoose.model("ChannelChat");
const User = mongoose.model("User");


const WHATSAPP_EXCHANGE = 'notification_direct';
const WHATSAPP_QUEUE = 'whatsapp_notification_queue';
const WHATSAPP_ROUTING_KEY = 'notification.whatsapp';

const RABBITMQ_CONFIG = {
  protocol: 'amqp',
  hostname: process.env.RABBITMQ_HOST || 'localhost',
  port: process.env.RABBITMQ_PORT || 5672,
  username: process.env.RABBITMQ_USER || 'admin',
  password: process.env.RABBITMQ_PASS || 'admin123',
  vhost: process.env.RABBITMQ_VHOST || '/',
  heartbeat: 60
};

class WhatsAppQueueService {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.reconnecting = false;
    this.consumerTag = null;
  }

  async checkConnection() {
    if (!this.connection || !this.channel) {
      await this.connect();
    }
  }

  async connect() {
    const maxRetries = 5;
    let retries = 0;
    
    const tryConnect = async () => {
      try {
        this.connection = await amqp.connect(RABBITMQ_CONFIG);
        this.channel = await this.connection.createChannel();

        this.connection.on('error', (err) => {
          console.error('[RabbitMQ] Connection error', err);
          this.reconnect();
        });

        this.connection.on('close', () => {
          console.error('[RabbitMQ] Connection closed');
          this.reconnect();
        });

        await this.channel.assertExchange(WHATSAPP_EXCHANGE, 'direct', { durable: true });
        await this.channel.assertQueue(WHATSAPP_QUEUE, { durable: true });
        await this.channel.bindQueue(WHATSAPP_QUEUE, WHATSAPP_EXCHANGE, WHATSAPP_ROUTING_KEY);
        
        await this.startConsumer();
        
        console.log('[RabbitMQ] WhatsApp Queue ready ✅');
      } catch (err) {
        if (retries < maxRetries) {
          retries++;
          console.log(`[RabbitMQ] Connection attempt ${retries} of ${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          return tryConnect();
        }
        throw err;
      }
    };

    await tryConnect();
  }

  async startConsumer() {
    try {
      const { consumerTag } = await this.channel.consume(
        WHATSAPP_QUEUE,
        async (msg) => {
          if (!msg) return;

          try {
            const { channelId, topicId } = JSON.parse(msg.content.toString());

            const [channelData, topicData] = await Promise.all([
              Channel.findById(channelId),
              Topic.findById(topicId)
            ]);

            if (!channelData || !topicData) {
              console.error('[Worker] Channel or Topic not found');
              this.channel.ack(msg);
              return;
            }

            const usersToNotify = [];

            for (const userId of channelData?.members || []) {
              const lastReadEntry = topicData.lastRead?.find(
                (lr) => lr.user.toString() === userId.toString()
              );
              const lastReadTimestamp = lastReadEntry?.timestamp || new Date(0);

              const unreadMessages = await ChannelChat.countDocuments({
                topic: topicId,
                createdAt: { $gt: lastReadTimestamp },
              });

              const isTopicOwner = userId.toString() === topicData?.user?.toString();

              if (isTopicOwner || unreadMessages >= 10) {
                usersToNotify.push({ userId, unreadMessages, forceNotify: isTopicOwner });
              }
            }

            const adminUser = await User.findById(channelData.user);

            const batchSize = 5;
            for (let i = 0; i < usersToNotify.length; i += batchSize) {
              const batch = usersToNotify.slice(i, i + batchSize);
              await Promise.all(
                batch.map(async ({ userId, unreadMessages, forceNotify }) => {
                  const user = await User.findById(userId);
                  if (!user || user.isOnline || !user.whatsapp_number) return;

                  const notificationData = {
                    userId,
                    type: 'chat',
                    data: {
                      name: user.username || "User",
                      username: adminUser.username,
                      channelId: channelId,
                      topicId: topicId,
                      channelName: channelData.name || "Channel",
                      unreadMessages,
                      forceNotify
                    }
                  };

                  await sendWhatsAppNotification(user.whatsapp_number, notificationData);
                })
              );
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

            this.channel.ack(msg);
          } catch (err) {
            console.error('[Worker] Error processing message:', err);
            const shouldRequeue = !err.message.includes('not found');
            this.channel.nack(msg, false, shouldRequeue);
          }
        },
        { noAck: false }
      );
      
      this.consumerTag = consumerTag;
      console.log('[Worker] WhatsApp Notification Worker running...');
    } catch (err) {
      console.error('[Worker] Failed to start consumer:', err);
      throw err;
    }
  }

  async reconnect() {
    if (this.reconnecting) return;
    this.reconnecting = true;
    
    try {
      await this.close();
      await this.connect();
    } catch (err) {
      console.error('[RabbitMQ] Reconnection failed:', err);
    } finally {
      this.reconnecting = false;
    }
  }

  async publishNotification(payload) {
    try {
      await this.checkConnection();

      this.channel.publish(
        WHATSAPP_EXCHANGE,
        WHATSAPP_ROUTING_KEY,
        Buffer.from(JSON.stringify(payload)),
        { persistent: true }
      );

      console.log('[RabbitMQ] WhatsApp notification published:', payload);
    } catch (err) {
      console.error('[RabbitMQ] WhatsApp publish error:', err);
    }
  }

  async close() {
    if (this.consumerTag) {
      await this.channel.cancel(this.consumerTag);
    }
    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();
    this.channel = null;
    this.connection = null;
    this.consumerTag = null;
  }
}

module.exports = new WhatsAppQueueService();
