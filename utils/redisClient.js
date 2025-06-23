const Redis = require("ioredis");

const client = new Redis(process.env.REDIS_URL, {
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3
});

client.on("error", (err) => {
  console.error("Redis connection error:", err);
});

client.on("connect", () => {
  console.log("✅ Redis connected");
});

module.exports = client;
