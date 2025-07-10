// const amqp = require("amqplib");
// const mongoose = require("mongoose");
// const AdminNotification = mongoose.model("AdminNotification");
// const Analytics = mongoose.model("Analytics");

// const NOTIFICATION_EXCHANGE = "notification_send_direct";
// const NOTIFICATION_QUEUE = "notification_accept_request_queue";
// const NOTIFICATION_ROUTING_KEY = "notification_request";

// const RABBITMQ_CONFIG = {
//   protocol: "amqp",
//   hostname: process.env.RABBITMQ_HOST || "localhost",
//   port: process.env.RABBITMQ_PORT || 5672,
//   username: process.env.RABBITMQ_USER || "admin",
//   password: process.env.RABBITMQ_PASS || "admin123",
//   vhost: process.env.RABBITMQ_VHOST || "/",
//   heartbeat: 60,
// };

// class RabbitMQNotificationService {
//   constructor() {
//     this.connection = null;
//     this.channel = null;
//   }

//   async connect() {
//     if (!this.connection) {
//       this.connection = await amqp.connect(RABBITMQ_CONFIG);
//       this.channel = await this.connection.createChannel();

//       await this.channel.assertExchange(NOTIFICATION_EXCHANGE, "direct", {
//         durable: true,
//       });
//       await this.channel.assertQueue(NOTIFICATION_QUEUE, { durable: true });
//       await this.channel.bindQueue(
//         NOTIFICATION_QUEUE,
//         NOTIFICATION_EXCHANGE,
//         NOTIFICATION_ROUTING_KEY
//       );
//     }
//   }

//   async sendNotificationMessage({
//     type,
//     business,
//     buttonLink,
//     buttonText,
//     content,
//     user,
//     interactionCount,
//   }) {
//     await this.connect();
//     const msg = {
//       type,
//       business,
//       buttonLink,
//       buttonText,
//       content,
//       user,
//       interactionCount,
//     };
//     this.channel.publish(
//       NOTIFICATION_EXCHANGE,
//       NOTIFICATION_ROUTING_KEY,
//       Buffer.from(JSON.stringify(msg)),
//       { persistent: true }
//     );
//     console.log("[Notification MQ] Message published");
//   }

//   async startNotificationConsumer() {
//     await this.connect();

//     console.log("[Notification MQ] Waiting for messages...");

//     this.channel.consume(NOTIFICATION_QUEUE, async (msg) => {
//       if (msg !== null) {
//         try {
//           const data = JSON.parse(msg.content.toString());
//           if (data.type === "admin_notification") {
//             const notification = new AdminNotification({
//               business: data.business,
//               buttonLink: data.buttonLink,
//               buttonText: data.buttonText,
//               content: data.content,
//             });
//             await notification.save();
//           } else if (data.type === "analytics") {
//             const analytics = new Analytics({
//               user: data.user,
//               interactionCount: data.interactionCount,
//             });
//             await analytics.save();
//           }
//           console.log("[Notification MQ] Received message:", data);
//           this.channel.ack(msg);
//         } catch (error) {
//           console.error("[Notification MQ] Error processing message:", error);
//           this.channel.nack(msg, false, false);
//         }
//       }
//     });
//   }
// }

// const notificationRabbitmqService = new RabbitMQNotificationService();
// notificationRabbitmqService.startConsumer();

// module.exports = notificationRabbitmqService;
