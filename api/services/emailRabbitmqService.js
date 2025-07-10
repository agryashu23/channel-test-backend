const amqp = require("amqplib");
const sendAcceptChannelRequest = require("../../coms/acceptChannel/sendAcceptChannelRequest");
const mongoose = require("mongoose");
const ChannelMembership = mongoose.model("ChannelMembership");
const TopicMembership = mongoose.model("TopicMembership");
const EventMembership = mongoose.model("EventMembership");
const Channel = mongoose.model("Channel");
const Topic = mongoose.model("Topic");
const User = mongoose.model("User");
const AdminNotification = mongoose.model("AdminNotification");
const Analytics = mongoose.model("Analytics");
const RedisHelper = require("../../utils/redisHelpers");
const {CachePrefix} = require("../../utils/prefix");


const EMAIL_EXCHANGE = "email_send_direct";
const QUEUE_NAME = "email_accept_request_queue";
const ROUTING_KEY = "accept_channel_request";

const TOPIC_QUEUE = "topic_admin_membership_queue";
const TOPIC_EXCHANGE = "topic_admin_direct";
const TOPIC_ROUTING_KEY = "topic.add_admins";

const TOPIC_QUEUE_ADD_ADMINS = "topic_add_admins_queue";
const TOPIC_EXCHANGE_ADD_ADMINS = "topic_add_admins_direct";
const TOPIC_ROUTING_KEY_ADD_ADMINS = "topic.add_admins";

const EVENT_QUEUE = "event_admin_membership_queue";
const EVENT_EXCHANGE = "event_admin_direct";
const EVENT_ROUTING_KEY = "event.add_admins";

const NOTIFICATION_EXCHANGE = "notification_send_direct";
const NOTIFICATION_QUEUE = "notification_accept_request_queue";
const NOTIFICATION_ROUTING_KEY = "notification_request";

const TOPIC_MEMBERSHIP_EXCHANGE = "topic_membership_direct";
const TOPIC_MEMBERSHIP_QUEUE = "topic_membership_redis_queue";
const TOPIC_MEMBERSHIP_ROUTING_KEY = "topic.membership.redis.sync";


const RABBITMQ_CONFIG = {
  protocol: "amqp",
  hostname: process.env.RABBITMQ_HOST || "localhost",
  port: process.env.RABBITMQ_PORT || 5672,
  username: process.env.RABBITMQ_USER || "admin",
  password: process.env.RABBITMQ_PASS || "admin123",
  vhost: process.env.RABBITMQ_VHOST || "/",
  heartbeat: 60,
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

      await this.channel.assertExchange(EMAIL_EXCHANGE, "direct", {
        durable: true,
      });
      await this.channel.assertQueue(QUEUE_NAME, { durable: true });
      await this.channel.bindQueue(QUEUE_NAME, EMAIL_EXCHANGE, ROUTING_KEY);
    }
  }

  async sendEmailMessage({
    to,
    channelId,
    channelName,
    username,
    logo,
    topicId = "",
    topicName = "",
    eventId = "",
    eventName = "",
  }) {
    await this.connect();
    const msg = {
      to,
      channelId,
      channelName,
      username,
      logo,
      topicId,
      topicName,
      eventId,
      eventName,
    };
    this.channel.publish(
      EMAIL_EXCHANGE,
      ROUTING_KEY,
      Buffer.from(JSON.stringify(msg)),
      { persistent: true }
    );
    console.log("[Email MQ] Message published for:", to);
  }

  async sendNotificationMessage({
    type,
    business,
    buttonLink,
    buttonText,
    content,
    user,
    interactionCount,
  }) {
    await this.connect();
    const msg = {
      type,
      business,
      buttonLink,
      buttonText,
      content,
      user,
      interactionCount,
    };
    this.channel.publish(
      NOTIFICATION_EXCHANGE,
      NOTIFICATION_ROUTING_KEY,
      Buffer.from(JSON.stringify(msg)),
      { persistent: true }
    );
    console.log("[Notification MQ] Message published");
  }

  async sendTopicAdminMembershipJob({ topicId, channelId, creatorId ,business=null}) {
    await this.connect();
    const msg = { topicId, channelId, creatorId,business };
  
    await this.channel.assertExchange(TOPIC_EXCHANGE, "direct", { durable: true });
    await this.channel.assertQueue(TOPIC_QUEUE, { durable: true });
    await this.channel.bindQueue(TOPIC_QUEUE, TOPIC_EXCHANGE, TOPIC_ROUTING_KEY);
  
    this.channel.publish(
      TOPIC_EXCHANGE,
      TOPIC_ROUTING_KEY,
      Buffer.from(JSON.stringify(msg)),
      { persistent: true }
    );
  
    console.log("[Topic MQ] Job queued for topic:", topicId);
  }

  async AddAdminMembershipTopicsJob({ userId, channelId,business}) {
    await this.connect();
    const msg = { channelId, userId,business};
  
    await this.channel.assertExchange(TOPIC_EXCHANGE_ADD_ADMINS, "direct", { durable: true });
    await this.channel.assertQueue(TOPIC_QUEUE_ADD_ADMINS, { durable: true });
    await this.channel.bindQueue(TOPIC_QUEUE_ADD_ADMINS, TOPIC_EXCHANGE_ADD_ADMINS, TOPIC_ROUTING_KEY_ADD_ADMINS);
  
    this.channel.publish(
      TOPIC_EXCHANGE_ADD_ADMINS,
      TOPIC_ROUTING_KEY_ADD_ADMINS,
      Buffer.from(JSON.stringify(msg)),
      { persistent: true }
    );
  
    console.log("[Topic MQ] Job queued for topic:", userId);
  }

  async sendEventAdminMembershipJob({ eventId, topicId, creatorId ,business=null}) {
    await this.connect();
    const msg = { eventId, topicId, creatorId,business };
  
    await this.channel.assertExchange(EVENT_EXCHANGE, "direct", { durable: true });
    await this.channel.assertQueue(EVENT_QUEUE, { durable: true });
    await this.channel.bindQueue(EVENT_QUEUE, EVENT_EXCHANGE, EVENT_ROUTING_KEY);
  
    this.channel.publish(
      EVENT_EXCHANGE,
      EVENT_ROUTING_KEY,
      Buffer.from(JSON.stringify(msg)),
      { persistent: true }
    );
  
    console.log("[Event MQ] Job queued for event:", eventId);
  }

  

  async sendTopicMembershipRedisSyncJob({ topicIds, userId }) {
    await this.connect();
    const msg = { topicIds, userId };
    await this.channel.assertExchange(TOPIC_MEMBERSHIP_EXCHANGE, "direct", { durable: true });
    await this.channel.assertQueue(TOPIC_MEMBERSHIP_QUEUE, { durable: true });
    await this.channel.bindQueue(TOPIC_MEMBERSHIP_QUEUE, TOPIC_MEMBERSHIP_EXCHANGE, TOPIC_MEMBERSHIP_ROUTING_KEY);
  
    this.channel.publish(
      TOPIC_MEMBERSHIP_EXCHANGE,
      TOPIC_MEMBERSHIP_ROUTING_KEY,
      Buffer.from(JSON.stringify(msg)),
      { persistent: true }
    );
  
    console.log("[TopicMembership MQ] Job queued for topics:", topicIds.length);
  }

  async startConsumer() {
    await this.connect();

    console.log("[Email MQ] Waiting for messages...");

    this.channel.consume(QUEUE_NAME, async (msg) => {
      if (msg !== null) {
        try {
          const data = JSON.parse(msg.content.toString());
          await sendAcceptChannelRequest(
            data.to,
            data.channelId,
            data.channelName,
            data.username,
            data.logo,
            data.topicId,
            data.topicName,
            data.eventId,
            data.eventName
          );
          this.channel.ack(msg);
        } catch (error) {
          console.error("[Email MQ] Error processing message:", error);
          this.channel.nack(msg, false, false);
        }
      }
    });
  }

  async startTopicAdminConsumer() {
    await this.connect();
  
    await this.channel.assertExchange(TOPIC_EXCHANGE, "direct", { durable: true });
    await this.channel.assertQueue(TOPIC_QUEUE, { durable: true });
    await this.channel.bindQueue(TOPIC_QUEUE, TOPIC_EXCHANGE, TOPIC_ROUTING_KEY);
  
    console.log("[Topic MQ] Waiting for admin-join jobs...");
  
    this.channel.consume(TOPIC_QUEUE, async (msg) => {
      if (msg) {
        try {
          const { topicId, channelId, creatorId,business} = JSON.parse(msg.content.toString());
          const admins = await ChannelMembership.find({
            channel: channelId,
            user: { $ne: creatorId },
            role: { $in: ["admin", "owner"] },
            status: "joined"
          }).populate([
            { path: "user", select: "_id email" },
          ]).lean();

          const bulkOps = admins.map((admin) => ({
            updateOne: {
              filter: {
                topic: topicId,
                user: admin.user._id,
              },
              update: {
                $set: {
                  channel: channelId,
                  status: "joined",
                  role: admin.role,
                  email: admin.user.email,
                  business: business,
                },
              },
              upsert: true,
            },
          }));
          
          if (bulkOps.length) {
            await TopicMembership.bulkWrite(bulkOps);
            const memberships = await TopicMembership.find({
              topic: topicId,
              user: { $in: admins.map(a => a.user) },
              status: "joined",
            })
            .populate([
              { path: "user", select: "_id name username logo color_logo email" },
              { path: "topic", select: "_id name" },
            ])
            .lean();

            if (memberships.length) {
              await RedisHelper.addUserToTopicsBulk(memberships);
            }
          }
          this.channel.ack(msg);
        } catch (err) {
          console.error("[Topic MQ] Failed to process admin topic join:", err);
          this.channel.nack(msg, false, false);
        }
      }
    });
  }


  async startTopicsAddAdminConsumer() {
    await this.connect();
  
    await this.channel.assertExchange(TOPIC_EXCHANGE_ADD_ADMINS, "direct", { durable: true });
    await this.channel.assertQueue(TOPIC_QUEUE_ADD_ADMINS, { durable: true });
    await this.channel.bindQueue(TOPIC_QUEUE_ADD_ADMINS, TOPIC_EXCHANGE_ADD_ADMINS, TOPIC_ROUTING_KEY_ADD_ADMINS);
  
    console.log("[Topic MQ] Waiting for admin-join jobs...");
  
    this.channel.consume(TOPIC_QUEUE_ADD_ADMINS, async (msg) => {
      if (msg) {
        try {
          const { channelId, userId,business} = JSON.parse(msg.content.toString());
          const channels = await Channel.findById(channelId).select("business topics").lean();
          const user = await User.findById(userId).select("email").lean();
          const topicIds = channels.topics;

          const bulkOps = topicIds.map(topicId => ({
            updateOne: {
              filter: {
                topic: topicId,
                user: userId,
              },
              update: {
                $set: {
                  channel: channelId,
                  status: "joined",
                  role: "admin",
                  email: user.email,
                  business: business,
                },
              },
              upsert: true,
            },
          }));
      
          await TopicMembership.bulkWrite(bulkOps);
          const memberships = await TopicMembership.find({
            topic: { $in: topicIds },
            user: userId,
            status: "joined",
          })
          .populate([
            { path: "user", select: "_id name username logo color_logo email" },
            { path: "topic", select: "_id name" },
          ])
          .lean();
          for(const topicId of topicIds){
            await RedisHelper.updateRoleInTopicMembership(topicId, userId, "admin");
          }
          if (memberships.length) {
            await RedisHelper.addUserToTopicsBulk(memberships);
          }
          this.channel.ack(msg);
        } catch (err) {
          console.error("[Topic MQ] Failed to process admin topic join:", err);
          this.channel.nack(msg, false, false);
        }
      }
    });
  }

  async startEventAdminConsumer() {
    await this.connect();
  
    await this.channel.assertExchange(EVENT_EXCHANGE, "direct", { durable: true });
    await this.channel.assertQueue(EVENT_QUEUE, { durable: true });
    await this.channel.bindQueue(EVENT_QUEUE, EVENT_EXCHANGE, EVENT_ROUTING_KEY);
  
    console.log("[Event MQ] Waiting for admin-join jobs...");
  
    this.channel.consume(EVENT_QUEUE, async (msg) => {
      if (msg) {
        try {

          const { channelId, userId} = JSON.parse(msg.content.toString());
          const admins = await TopicMembership.find({
            topic: topicId,
            user: { $ne: creatorId },
            role: { $in: ["admin", "owner"] },
            status: "joined"
          }).lean();

          const bulkOps = admins.map((admin) => ({
            updateOne: {
              filter: {
                topic: topicId,
                user: admin.user,
              },
              update: {
                $set: {
                  event: eventId,
                  status: "joined",
                  role: admin.role,
                  business: business,
                },
              },
              upsert: true,
            },
          }));
          
          if (bulkOps.length) {
            await EventMembership.bulkWrite(bulkOps);
             const memberships = await EventMembership.find({
               event: eventId,
               user: { $in: admins.map(a => a.user) },
               status: "joined",
             })
             .lean();
             if (memberships.length) {
               await RedisHelper.addMemberToEventBulk(eventId, memberships);
               await RedisHelper.addUserEventMembershipBulk(topicId, admins.map(a => a.user), memberships);
             }
           }
          this.channel.ack(msg);
        } catch (err) {
          console.error("[Topic MQ] Failed to process admin topic join:", err);
          this.channel.nack(msg, false, false);
        }
      }
    });
  }

  async startTopicMembershipRedisConsumer() {
    await this.connect();
  
    await this.channel.assertExchange(TOPIC_MEMBERSHIP_EXCHANGE, "direct", { durable: true });
    await this.channel.assertQueue(TOPIC_MEMBERSHIP_QUEUE, { durable: true });
    await this.channel.bindQueue(TOPIC_MEMBERSHIP_QUEUE, TOPIC_MEMBERSHIP_EXCHANGE, TOPIC_MEMBERSHIP_ROUTING_KEY);
    console.log("[TopicMembership MQ] Waiting for topic-user sync jobs...");
    this.channel.consume(TOPIC_MEMBERSHIP_QUEUE, async (msg) => {
      if (msg) {
        try {
          const { topicIds, userId } = JSON.parse(msg.content.toString());
  
          const memberships = await TopicMembership.find({
            topic: { $in: topicIds },
            user: userId,
            status: "joined",
          })
            .populate([
              { path: "user", select: "_id name username logo color_logo email" },
              { path: "topic", select: "_id name" },
            ])
            .lean();
  
          if (memberships.length) {
            await RedisHelper.addUserToTopicsBulk(memberships);
          }
  
          this.channel.ack(msg);
        } catch (err) {
          console.error("[TopicMembership MQ] Error processing:", err);
          this.channel.nack(msg, false, false);
        }
      }
    });
  }

  async startNotificationConsumer() {
    await this.connect();

    console.log("[Notification MQ] Waiting for messages...");

    this.channel.consume(NOTIFICATION_QUEUE, async (msg) => {
      if (msg !== null) {
        try {
          const data = JSON.parse(msg.content.toString());
          if (data.type === "admin_notification") {
            const notification = new AdminNotification({
              business: data.business,
              buttonLink: data.buttonLink,
              buttonText: data.buttonText,
              content: data.content,
            });
            await notification.save();
          } else if (data.type === "analytics") {
            const analytics = new Analytics({
              user: data.user,
              interactionCount: data.interactionCount,
            });
            await analytics.save();
          }
          console.log("[Notification MQ] Received message:", data);
          this.channel.ack(msg);
        } catch (error) {
          console.error("[Notification MQ] Error processing message:", error);
          this.channel.nack(msg, false, false);
        }
      }
    });
  }
}

// Usage
const emailRabbitmqService = new RabbitMQEmailService();
emailRabbitmqService.startConsumer();
emailRabbitmqService.startTopicAdminConsumer();
emailRabbitmqService.startNotificationConsumer();
emailRabbitmqService.startTopicMembershipRedisConsumer();
emailRabbitmqService.startEventAdminConsumer();
emailRabbitmqService.startTopicsAddAdminConsumer();

module.exports = emailRabbitmqService;
