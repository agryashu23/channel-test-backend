const redis = require('../../utils/redisClient');
require('dotenv').config();

const CACHE_TTL = 3600; 

const redisService = {
  async ping() {
    try {
      await redis.ping();
      return true;
    } catch (error) {
      console.error('Redis PING Error:', error);
      return false;
    }
  },

  async getCache(key) {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis GET Error:', error);
      return null;
    }
  },

  async setCache(key, value, ttl = CACHE_TTL) {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch (error) {
      console.error('Redis SET Error:', error);
    }
  },

  async delCache(key) {
    try {
      await redis.del(key);
    } catch (error) {
      console.error('Redis DEL Error:', error);
    }
  },

 
  async delPatternCache(pattern) {
    const stream = redis.scanStream({
      match: pattern,
      count: 100,
    });
  
    const keysToDelete = [];
  
    return new Promise((resolve, reject) => {
      stream.on('data', (keys) => {
        if (keys.length) {
          keysToDelete.push(...keys);
        }
      });
  
      stream.on('end', async () => {
        if (keysToDelete.length) {
          await redis.del(...keysToDelete);
          console.log(`[Redis] Deleted ${keysToDelete.length} keys matching pattern: ${pattern}`);
        }
        resolve();
      });
  
      stream.on('error', reject);
    });
  }
};



module.exports = redisService; 