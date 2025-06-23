// const amqp = require('amqplib');
// const sharp = require('sharp');
// const { uploadSingleImage, uploadMultipleImagesChips } = require('./Images');
// const { distributedService } = require('../../services/DistributedService');

// class ImageQueue {
//   constructor() {
//     this.channel = null;
//     this.connection = null;
//     this.QUEUE_NAME = 'image_processing';
//   }

//   async connect() {
//     try {
//       this.connection = await amqp.connect(process.env.RABBITMQ_URL);
//       this.channel = await this.connection.createChannel();
//       await this.channel.assertQueue(this.QUEUE_NAME, { durable: true });
//       console.log('Connected to RabbitMQ for image processing');
//     } catch (error) {
//       console.error('Error connecting to RabbitMQ:', error);
//       throw error;
//     }
//   }

//   async processImage(file, name, options = {}) {
//     if (!this.channel) {
//       await this.connect();
//     }

//     const messageData = {
//       fileBuffer: file.buffer.toString('base64'),
//       fileName: file.originalname,
//       name,
//       options
//     };

//     await this.channel.sendToQueue(
//       this.QUEUE_NAME,
//       Buffer.from(JSON.stringify(messageData)),
//       { persistent: true }
//     );

//     return { queued: true, message: 'Image queued for processing' };
//   }

//   async processMultipleImages(files, name, options = {}) {
//     if (!this.channel) {
//       await this.connect();
//     }

//     const promises = files.map(file => {
//       const messageData = {
//         fileBuffer: file.buffer.toString('base64'),
//         fileName: file.originalname,
//         name,
//         options
//       };

//       return this.channel.sendToQueue(
//         this.QUEUE_NAME,
//         Buffer.from(JSON.stringify(messageData)),
//         { persistent: true }
//       );
//     });

//     await Promise.all(promises);
//     return { queued: true, message: 'Images queued for processing' };
//   }

//   async startConsumer() {
//     if (!this.channel) {
//       await this.connect();
//     }

//     this.channel.consume(this.QUEUE_NAME, async (msg) => {
//       if (msg !== null) {
//         try {
//           const data = JSON.parse(msg.content.toString());
//           const fileBuffer = Buffer.from(data.fileBuffer, 'base64');
          
//           // Process image
//           const processedBuffer = await this.optimizeImage(fileBuffer);
          
//           // Upload to S3
//           const uploadResult = await uploadSingleImage(
//             { buffer: processedBuffer, originalname: data.fileName },
//             data.name
//           );

//           // Notify through distributed service about completion
//           await distributedService.publishImageProcessed({
//             originalName: data.fileName,
//             url: uploadResult,
//             success: true
//           });

//           this.channel.ack(msg);
//         } catch (error) {
//           console.error('Error processing image:', error);
//           // Requeue the message if it's a temporary failure
//           this.channel.nack(msg, false, true);
          
//           await distributedService.publishImageProcessed({
//             originalName: data.fileName,
//             error: error.message,
//             success: false
//           });
//         }
//       }
//     });
//   }

//   async optimizeImage(buffer) {
//     const sharpInstance = sharp(buffer);
//     let resizedImageBuffer = await sharp(buffer)
//       .jpeg({ quality: 80 })
//       .toBuffer();

//     const maxSize = 300 * 1024;
//     let currentQuality = 80;
//     let width = null;

//     const metadata = await sharpInstance.metadata();

//     while (resizedImageBuffer.length > maxSize && currentQuality > 20) {
//       width = Math.round(width ? width * 0.9 : metadata.width * 0.9);
//       resizedImageBuffer = await sharp(buffer)
//         .resize({ width })
//         .jpeg({ quality: currentQuality })
//         .toBuffer();
//       currentQuality -= 20;
//     }

//     return resizedImageBuffer;
//   }

//   async close() {
//     if (this.channel) {
//       await this.channel.close();
//     }
//     if (this.connection) {
//       await this.connection.close();
//     }
//   }
// }

// module.exports = new ImageQueue(); 