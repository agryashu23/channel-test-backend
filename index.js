const express = require("express");
const app = express();
var cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const multer = require("multer");
var mongoose = require("mongoose");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");
const helmet = require("helmet");
const rabbitmqService = require('./api/services/rabbitmqService');
const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");
require("dotenv").config();
const { globalLimiter } = require('./middlewares/rateLimiters');
const client = new BedrockRuntimeClient({ region: "us-east-1" });
const { corsOptionsDelegate } = require('./config/cors');
const Razorpay = require("razorpay");

app.set("trust proxy", 1);
app.use(cors(corsOptionsDelegate));
app.use(cookieParser());
const db = require("./db/db");
require("./cronJobs");

rabbitmqService.connect();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});
const AWS = require("aws-sdk");

app.use(bodyParser.json({ limit: "100mb" }));
app.use(bodyParser.urlencoded({ limit: "100mb", extended: true }));
app.use(bodyParser.text({ limit: "100mb", type: "text/*" }));
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "http://localhost:3001",
          /^https:\/\/.*\.channels\.social$/,
          "https://channels.social",
          "http://localhost:3001",
          "https://chips.org.in",
          "https://channelsbychips.site",
        ],
        imgSrc: [
          "'self'",
          "data:",
          /^https:\/\/.*\.channels\.social$/,
          "https://channels.social",
          "https://chips.org.in",
          "http://localhost:3001",
          "https://d3i6prk51rh5v9.cloudfront.net",
          "https://chips-social.s3.ap-south-1.amazonaws.com",
          "https://channelsbychips.site",
        ],
        frameAncestors: [
          "'self'",
          "*",
        ],
      },
    },
  })
);

app.use(globalLimiter);
const server = http.createServer(app);

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const route53 = new AWS.Route53({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// const io = new Server(server, {
//   path: "/ws",
//   cors: {
//     origin: [
//       "http://localhost:3001",
//       "https://channels.social",
//       "https://chips.org.in",
//       "https://channelsbychips.site",
//     ],
//     methods: ["GET", "POST"],
//     credentials: true,
//   },
// });
const io = new Server(server, {
  path: "/ws",
  cors: {
    origin: (origin, callback) => {
      const allowAll = process.env.NODE_ENV === "production";
      const whitelist = [
        "http://localhost:3001",
        "https://channels.social",
        "https://chips.org.in",
        "https://channelsbychips.site",
        "https://81ca-103-156-200-193.ngrok-free.app"
      ];
      const regexWhitelist = [
        /^https:\/\/.*\.channels\.social$/,
        /^https:\/\/.*\.chips\.org\.in$/,
      ];

      if (
        whitelist.includes(origin) ||
        regexWhitelist.some((r) => r.test(origin)) ||
        allowAll
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by Socket.IO CORS"));
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});


app.set("io", io);
const routes = require("./api/routers/router");
app.use("/api", routes);
var User = mongoose.model("User");



io.on("connection", async (socket) => {
  console.log("A user connected:", socket.id);
  const { userId } = socket.handshake.auth;

  console.log("A user connected:", socket.id, "| userId:", userId);

  if (userId) {
    try {
      await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            isOnline: true,
          },
        },
        { new: true }
      );

      socket.userId = userId;
      socket.join(userId.toString());
    } catch (error) {
      console.error("Error updating user online status:", error);
    }
  }

  socket.on("join_dm_room", (otherUserId) => {
    if (otherUserId) {
      socket.join(otherUserId.toString());
    }
  });

  socket.on("leave_dm_room", (otherUserId) => {
    if (otherUserId) {
      socket.leave(otherUserId.toString());
    }
  });

  // socket.on("identify_user", async (userId) => {
  //   if (!userId) return;

  //   try {
  //     await User.findByIdAndUpdate(
  //       userId,
  //       { $set: { isOnline: true } },
  //       { new: true, upsert: true }
  //     ).exec();

  //     socket.userId = userId;
  //   } catch (error) {
  //     console.error("Error updating user online status:", error);
  //   }
  // });
  socket.on("join_topic", (data) => {
    const { username, topicId } = data;
    if (username && topicId) {
      socket.join(topicId);
    } else {
      console.error("Invalid join_topic data:", data);
    }
  });
  socket.on("leave_topic", (data) => {
    const { username, topicId } = data;
    if (username && topicId) {
      socket.leave(topicId);
    } else {
      console.error("Invalid leave_topic data:", data);
    }
  });
  socket.on("send_message", async (data) => {
    try {
      io.to(data.topic).emit("receive_message", data);
    } catch (error) {
      console.error("Error saving message via socket:", error);
    }
  });
  socket.on("delete_message", (data) => {
    const { chatId, topicId } = data;

    try {
      console.log(data);
      io.to(topicId).emit("chat_deleted", { chatId, topicId });
    } catch (error) {
      console.log(error);
      socket.emit("chat_delete_error", { message: "Error deleting message." });
    }
  });
  socket.on("disconnect", async () => {
    if (!socket.userId) return;

    try {
      await User.findByIdAndUpdate(
        socket.userId,
        {
          $set: {
            isOnline: false,
            lastSeen: new Date(),
          },
        },
        { new: true }
      );
      console.log(`User ${socket.userId} disconnected`);
    } catch (error) {
      console.error("Error updating user offline status:", error);
    }
  });
});

// app.get("/api/get-csrf-token", (req, res) => {
//   const csrfSecret = tokens.secretSync();
//   const csrfToken = tokens.create(csrfSecret);
//   res.cookie("csrfSecret", csrfSecret, {
//     httpOnly: true,
//     secure: process.env.NODE_ENV === "production",
//     sameSite: "None",
//     maxAge: 48 * 60 * 60 * 1000,
//   });
//   res.json({ csrfToken });
// });



app.get("/", function (req, res) {
  res.json({ message: "Welcome to Channels.social Server" });
});


server.listen(3000, "0.0.0.0", () => {
  console.log("Server is running on port 3000");
});
