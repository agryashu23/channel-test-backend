const redisService = require("../api/services/redisService");
const mongoose = require("mongoose");
const Business = mongoose.model("Business");
const Payment = mongoose.model("Payment");
const Plan = mongoose.model("Plan");
const Channel = mongoose.model("Channel");
const ChannelChat = mongoose.model("ChannelChat");
const Event = mongoose.model("Event");
const Poll = mongoose.model("Poll");
const PollVote = mongoose.model("PollVote");
const EventMembership = mongoose.model("EventMembership");
const Topic = mongoose.model("Topic");
const TopicMembership = mongoose.model("TopicMembership");
const ChannelMembership = mongoose.model("ChannelMembership");

const { CachePrefix } = require("./prefix");
const redisClient = require("./redisClient");

const EVENT_SELECT_FIELDS =
  "_id name user joining startDate endDate startTime endTime locationText location paywallPrice cover_image timezone type meet_url createdAt visibility";

const RedisHelper = {
  getChannelMembership: async function (userId, channelId) {
    if (!userId || !channelId || !mongoose.Types.ObjectId.isValid(userId))
      return null;
    const key = `${CachePrefix.CHANNEL_MEMBERSHIP_USER_PREFIX}${channelId}:${userId}`;
    const cached = await redisService.getCache(key);
    // const cached = null;
    if (cached) return cached;
    const membership = await ChannelMembership.findOne({
      user: userId,
      channel: channelId,
    }).lean();
    if (!membership) return null;
    await redisService.setCache(key, membership, 3600);
    return membership;
  },
  getTopicMembership: async function (userId, topicId) {
    if (!userId || !topicId || !mongoose.Types.ObjectId.isValid(userId))
      return null;
    const key = `${CachePrefix.TOPIC_MEMBERSHIP_USER_PREFIX}${topicId}:${userId}`;
    const cached = await redisService.getCache(key);
    if (cached) return cached;
    const membership = await TopicMembership.findOne({
      user: userId,
      topic: topicId,
    }).lean();
    if (!membership) return null;
    await redisService.setCache(key, membership, 3600);
    return membership;
  },

  getBusinessPlan: async function (businessId) {
    if (!businessId || !mongoose.Types.ObjectId.isValid(businessId))
      return null;
    const cacheKey = `${CachePrefix.BUSINESS_PLAN_PREFIX}${businessId}`;
    const cached = await redisService.getCache(cacheKey);
    if (cached && cached.expiresAt) {
      const now = new Date();
      if (new Date(cached.expiresAt) > now && cached.isActive) {
        return cached;
      } else {
        await redisService.delCache(cacheKey);
      }
    }
    if (!businessId) {
      return null;
    }
    const business = await Business.findById(businessId)
      .select("current_subscription")
      .populate({
        path: "current_subscription",
        select: "_id planId expiresAt isActive billingCycle isPayAsYouGo",
      })
      .lean();
    if (!business || !business?.current_subscription) return null;

    let plan = null;
    const planCacheKey = `${CachePrefix.PLAN_PREFIX}${business.current_subscription.planId}`;
    plan = await redisService.getCache(planCacheKey);
    if (!plan) {
      plan = await Plan.findById(business.current_subscription.planId).lean();
    }
    if (!plan) return null;
    await redisService.setCache(planCacheKey, plan, 36000);
    const planWithMeta = {
      ...plan,
      billingCycle: business.current_subscription.billingCycle,
      isPayAsYouGo: business.current_subscription.isPayAsYouGo,
      expiresAt: business.current_subscription.expiresAt,
      isActive: business.current_subscription.isActive,
      paymentId: business.current_subscription._id,
    };
    await redisService.setCache(cacheKey, planWithMeta, 3600);
    return planWithMeta;
  },
  // channel count in business
  getChannelsCount: async function (businessId, userId) {
    if (!businessId && !userId) return 0;
    if (!businessId) {
      const count = await Channel.countDocuments({ user: userId });
      return count;
    }
    const cacheKey = `${CachePrefix.BUSINESS_CHANNELS_COUNT_PREFIX}${businessId}`;
    const cached = await redisService.getCache(cacheKey);
    if (cached) {
      return cached;
    }
    const channelsCount = await Channel.countDocuments({
      business: businessId,
    });
    await redisService.setCache(cacheKey, channelsCount, 2592000);
    return channelsCount;
  },
  incrementChannelsCount: async function (businessId) {
    if (!businessId || !mongoose.Types.ObjectId.isValid(businessId)) return;
    const cacheKey = `${CachePrefix.BUSINESS_CHANNELS_COUNT_PREFIX}${businessId}`;
    try {
      const exists = await redisClient.exists(cacheKey);
      if (!exists) {
        await redisClient.set(cacheKey, 0);
      }
      await redisClient.incr(cacheKey);
      await redisClient.expire(cacheKey, 2592000);
    } catch (error) {
      console.error("Redis INCR Error:", error);
    }
  },
  decrementChannelsCount: async function (businessId) {
    if (!businessId || !mongoose.Types.ObjectId.isValid(businessId)) return;
    const cacheKey = `${CachePrefix.BUSINESS_CHANNELS_COUNT_PREFIX}${businessId}`;
    try {
      await redisClient.decr(cacheKey);
      await redisClient.expire(cacheKey, 2592000);
    } catch (error) {
      console.error("Redis DECR Error:", error);
    }
  },
  // topic count in channel
  getTopicsCount: async function (channelId) {
    if (!channelId || !mongoose.Types.ObjectId.isValid(channelId)) return 0;
    const cacheKey = `${CachePrefix.TOPICS_CHANNEL_COUNT_PREFIX}${channelId}`;
    const cached = await redisService.getCache(cacheKey);
    if (cached) {
      return parseInt(cached) || 0;
    }
    const topicsCount = await Topic.countDocuments({ channel: channelId });
    await redisService.setCache(cacheKey, topicsCount, 2592000);
    return topicsCount;
  },
  incrementTopicsCount: async function (channelId) {
    if (!channelId || !mongoose.Types.ObjectId.isValid(channelId)) return;
    const cacheKey = `${CachePrefix.TOPICS_CHANNEL_COUNT_PREFIX}${channelId}`;
    try {
      const exists = await redisClient.exists(cacheKey);
      if (!exists) {
        await redisClient.set(cacheKey, 0);
      }
      await redisClient.incr(cacheKey);
      await redisClient.expire(cacheKey, 2592000);
    } catch (error) {
      console.error("Redis INCR Error:", error);
    }
  },
  decrementTopicsCount: async function (channelId) {
    if (!channelId || !mongoose.Types.ObjectId.isValid(channelId)) return;
    const cacheKey = `${CachePrefix.TOPICS_CHANNEL_COUNT_PREFIX}${channelId}`;
    try {
      await redisClient.decr(cacheKey);
      await redisClient.expire(cacheKey, 2592000);
    } catch (error) {
      console.error("Redis DECR Error:", error);
    }
  },
  // channel fetch
  getOrCacheChannel: async function (channelId, cacheKey) {
    if (!channelId || !mongoose.Types.ObjectId.isValid(channelId)) return null;
    let channel = await redisService.getCache(cacheKey);
    if (!channel) {
      channel = await Channel.findById(channelId)
        .populate([
          { path: "topics", select: "name _id editability visibility" },
          { path: "user", select: "name username _id logo color_logo" },
        ])
        .lean();

      if (channel) {
        await redisService.setCache(cacheKey, channel, 3600);
      }
    }
    return channel;
  },
  // topic fetch
  getOrCacheTopic: async function (topicId, cacheKey) {
    if (!topicId || !mongoose.Types.ObjectId.isValid(topicId)) return null;
    let topic = await redisService.getCache(cacheKey);
    if (!topic) {
      topic = await Topic.findById(topicId)
        .populate([
          { path: "channel", select: "name _id visibility" },
          { path: "user", select: "name username _id logo color_logo" },
        ])
        .lean();

      if (topic) {
        await redisService.setCache(cacheKey, topic, 3600);
      }
    }
    return topic;
  },
  getOrCacheEvent: async function (eventId) {
    const cacheKey = `${CachePrefix.EVENT_PREFIX}${eventId}`;
    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) return null;
    let event = await redisService.getCache(cacheKey);
    if (!event) {
      event = await Event.findById(eventId).select(EVENT_SELECT_FIELDS).lean();
    }
    if (event) {
      await redisService.setCache(cacheKey, event, 3600);
    }
    return event;
  },
  async addUserToBusiness(businessId, userId) {
    const key = `${CachePrefix.BUSINESS_USERS_COUNT_PREFIX}${businessId}`;
    await redisClient.sadd(key, userId.toString());
  },
  async removeUserFromBusiness(businessId, userId) {
    const stillMember = await ChannelMembership.exists({
      business: businessId,
      user: userId,
      status: "joined",
    });
    if (!stillMember) {
      const key = `${CachePrefix.BUSINESS_USERS_COUNT_PREFIX}${businessId}`;
      await redisClient.srem(key, userId.toString());
    }
  },
  async getUsersCount(businessId, channelId) {
    if (!businessId && !channelId) return 0;
    if (!businessId) {
      const uniqueUsers = await ChannelMembership.distinct("user", {
        channel: channelId,
        status: "joined",
      });
      return uniqueUsers.length;
    }
    const key = `${CachePrefix.BUSINESS_USERS_COUNT_PREFIX}${businessId}`;
    const count = await redisClient.scard(key);
    return count;
  },
  // request in business
  async appendRequestToBusinessArray(key, newItem, ttl = 3600) {
    const cached = await redisService.getCache(key);
    if (!cached) return;
    cached.push(newItem);
    await redisService.setCache(key, cached, ttl);
  },
  async removeRequestFromBusinessArray(key, itemId) {
    const cached = await redisService.getCache(key);
    if (!cached) return;
    const newArray = cached.filter(
      (i) => i._id.toString() !== itemId.toString()
    );
    await redisService.setCache(key, newArray, 3600);
  },
  // users in channel
  async addUserToChannel(channelId, membership) {
    const key = `${CachePrefix.CHANNELS_MEMBERS_PREFIX}${channelId}`;
    await redisClient.hset(
      key,
      membership?.user?._id.toString(),
      JSON.stringify(membership)
    );
  },
  async removeUserFromChannel(channelId, userId) {
    const key = `${CachePrefix.CHANNELS_MEMBERS_PREFIX}${channelId}`;
    await redisClient.hdel(key, userId.toString());
  },
  async getChannelMembers(channelId) {
    const key = `${CachePrefix.CHANNELS_MEMBERS_PREFIX}${channelId}`;
    const raw = await redisClient.hvals(key);
    if (!raw.length) {
      const channelMemberships = await ChannelMembership.find({
        user: { $ne: null },
        channel: channelId,
        status: "joined",
        role: { $ne: "owner" },
      })
        .populate([
          { path: "user", select: "_id name username email logo color_logo" },
        ])
        .lean();
      await this.setChannelMembersHash(channelId, channelMemberships);
      return channelMemberships;
    }
    return raw.map((json) => JSON.parse(json));
  },
  async setChannelMembersHash(channelId, members) {
    const key = `${CachePrefix.CHANNELS_MEMBERS_PREFIX}${channelId}`;
    const flattened = [];
    for (const m of members) {
      if (m.user && m.user._id) {
        flattened.push(m.user._id.toString(), JSON.stringify(m));
      }
    }
    if (flattened.length) {
      await redisClient.hset(key, ...flattened);
    }
  },
  // channel request
  async addUserToChannelRequest(channelId, membership) {
    const key = `${CachePrefix.CHANNEL_REQUESTS_PREFIX}${channelId}`;
    await redisClient.hset(
      key,
      membership?.user?._id.toString(),
      JSON.stringify(membership)
    );
  },
  async removeUserFromChannelRequest(channelId, userId) {
    const key = `${CachePrefix.CHANNEL_REQUESTS_PREFIX}${channelId}`;
    await redisClient.hdel(key, userId.toString());
  },
  async getChannelRequests(channelId) {
    const key = `${CachePrefix.CHANNEL_REQUESTS_PREFIX}${channelId}`;
    const raw = await redisClient.hvals(key);
    return raw.map((json) => JSON.parse(json));
  },
  async setChannelRequestsHash(channelId, requests) {
    const key = `${CachePrefix.CHANNEL_REQUESTS_PREFIX}${channelId}`;
    const flattened = [];
    for (const r of requests) {
      flattened.push(r.user?._id.toString(), JSON.stringify(r));
    }
    if (flattened.length) {
      await redisClient.hset(key, ...flattened);
    }
  },
  // users in topic
  async addUserToTopic(topicId, membership) {
    const key = `${CachePrefix.TOPICS_MEMBERS_PREFIX}${topicId}`;
    await redisClient.hset(
      key,
      membership?.user?._id.toString(),
      JSON.stringify(membership)
    );
  },
  async addUserToTopicsBulk(memberships) {
    const topicMap = new Map();
    for (const membership of memberships) {
      const topicId =
        membership.topic?._id?.toString() || membership.topic?.toString();
      const userId = membership.user?._id?.toString();
      if (!topicId || !userId) continue;
      const key = `${CachePrefix.TOPICS_MEMBERS_PREFIX}${topicId}`;
      if (!topicMap.has(key)) topicMap.set(key, []);
      topicMap.get(key).push(userId, JSON.stringify(membership));
    }
    for (const [key, flatPairs] of topicMap.entries()) {
      if (flatPairs.length) {
        await redisClient.hset(key, ...flatPairs);
      }
    }
  },
  async removeUserFromTopic(topicId, userId) {
    const key = `${CachePrefix.TOPICS_MEMBERS_PREFIX}${topicId}`;
    await redisClient.hdel(key, userId.toString());
  },
  async removeUserFromMultipleTopics(topicIds, userId) {
    if (!Array.isArray(topicIds) || !userId) return;
    const tasks = topicIds.map((topicId) => {
      const key = `${CachePrefix.TOPICS_MEMBERS_PREFIX}${topicId}`;
      return redisClient.hdel(key, userId.toString());
    });
    await Promise.all(tasks);
  },
  async getTopicMembers(topicId) {
    const key = `${CachePrefix.TOPICS_MEMBERS_PREFIX}${topicId}`;
    const raw = await redisClient.hvals(key);
    if (!raw.length) {
      const members = await TopicMembership.find({
        user: { $ne: null },
        topic: topicId,
        status: "joined",
        role: { $ne: "owner" },
      }).populate([
        { path: "user", select: "_id name username email logo color_logo" },
      ]);
      await this.setTopicMembersHash(topicId, members);
      return members;
    }
    return raw.map((json) => JSON.parse(json));
  },
  async setTopicMembersHash(topicId, members) {
    const key = `${CachePrefix.TOPICS_MEMBERS_PREFIX}${topicId}`;
    const flattened = [];
    for (const m of members) {
      flattened.push(m.user?._id.toString(), JSON.stringify(m));
    }
    if (flattened.length) {
      await redisClient.hset(key, ...flattened);
    }
  },
  // topic request
  async addUserToTopicRequest(topicId, membership) {
    const key = `${CachePrefix.TOPIC_REQUESTS_PREFIX}${topicId}`;
    await redisClient.hset(
      key,
      membership?.user?._id.toString(),
      JSON.stringify(membership)
    );
  },

  async removeUserFromTopicRequest(topicId, userId) {
    const key = `${CachePrefix.TOPIC_REQUESTS_PREFIX}${topicId}`;
    await redisClient.hdel(key, userId.toString());
  },
  async getTopicRequests(topicId) {
    const key = `${CachePrefix.TOPIC_REQUESTS_PREFIX}${topicId}`;
    const raw = await redisClient.hvals(key);
    return raw.map((json) => JSON.parse(json));
  },
  async setTopicRequestsHash(topicId, requests) {
    const key = `${CachePrefix.TOPIC_REQUESTS_PREFIX}${topicId}`;
    const flattened = [];
    for (const r of requests) {
      flattened.push(r.user?._id.toString(), JSON.stringify(r));
    }
    if (flattened.length) {
      await redisClient.hset(key, ...flattened);
    }
  },

  //topics in channel
  async addTopicToChannel(channelId, topic) {
    const key = `${CachePrefix.TOPICS_ALL_CHANNEL_PREFIX}${channelId}`;
    await redisClient.hset(key, topic._id.toString(), JSON.stringify(topic));
  },

  async removeTopicFromChannel(channelId, topicId) {
    const key = `${CachePrefix.TOPICS_ALL_CHANNEL_PREFIX}${channelId}`;
    await redisClient.hdel(key, topicId.toString());
  },

  async getAllChannelTopics(channelId, orderedTopicIds) {
    const key = `${CachePrefix.TOPICS_ALL_CHANNEL_PREFIX}${channelId}`;
    if (!orderedTopicIds || !orderedTopicIds.length) return [];

    const raw = await redisClient.hmget(
      key,
      ...orderedTopicIds.map((id) => id.toString())
    );
    return raw
      .map((json) => {
        try {
          return JSON.parse(json);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  },
  async updateTopicInChannel(channelId, topic) {
    const key = `${CachePrefix.TOPICS_ALL_CHANNEL_PREFIX}${channelId}`;
    await redisClient.hset(key, topic._id.toString(), JSON.stringify(topic));
  },

  async getTopicFromChannel(channelId, topicId) {
    const key = `${CachePrefix.TOPICS_ALL_CHANNEL_PREFIX}${channelId}`;
    const raw = await redisClient.hget(key, topicId.toString());
    return raw ? JSON.parse(raw) : null;
  },

  async setChannelTopicsHash(channelId, topics) {
    const key = `${CachePrefix.TOPICS_ALL_CHANNEL_PREFIX}${channelId}`;
    const flattened = [];
    for (const topic of topics) {
      flattened.push(topic._id.toString(), JSON.stringify(topic));
    }
    if (flattened.length) {
      await redisClient.hset(key, ...flattened);
    }
  },
  async updateLastRead(topicId, userId, timestamp = new Date()) {
    const key = `${CachePrefix.TOPIC_MEMBERSHIP_USER_PREFIX}${topicId}:${userId}`;
    const cached = await redisService.getCache(key);
    if (!cached) return;
    cached.lastReadAt = timestamp;
    await redisService.setCache(key, cached, 1800);
  },
  async updateRoleInTopicMembership(topicId, userId, newRole) {
    if (
      !userId ||
      !topicId ||
      !newRole ||
      !mongoose.Types.ObjectId.isValid(userId)
    )
      return;
    const key = `${CachePrefix.TOPIC_MEMBERSHIP_USER_PREFIX}${topicId}:${userId}`;
    const cached = await redisService.getCache(key);
    if (!cached) return;
    cached.role = newRole;
    await redisService.setCache(key, cached, 18000);
  },
  addPinnedChat: async function (topicId, chat) {
    if (!topicId || !chat || !mongoose.Types.ObjectId.isValid(topicId)) return;
    const cacheKey = `${CachePrefix.CHATS_PINNED_PREFIX}${topicId}`;
    const cached = await redisService.getCache(cacheKey);
    let pinnedChats = [];
    if (cached) {
      pinnedChats = cached;
      if (pinnedChats.some((c) => c._id === String(chat._id))) return;
    }
    pinnedChats.unshift(chat);
    await redisService.setCache(cacheKey, pinnedChats, 3600);
  },
  removePinnedChat: async function (topicId, chatId) {
    if (!topicId || !chatId || !mongoose.Types.ObjectId.isValid(topicId))
      return;
    const cacheKey = `${CachePrefix.CHATS_PINNED_PREFIX}${topicId}`;
    const cached = await redisService.getCache(cacheKey);
    if (!cached) return;
    const pinnedChats = cached;
    const updated = pinnedChats.filter(
      (chat) => String(chat._id) !== String(chatId)
    );
    await redisService.setCache(cacheKey, updated, 3600);
  },
  getPinnedChats: async function (topicId) {
    if (!topicId || !mongoose.Types.ObjectId.isValid(topicId)) return [];
    const cacheKey = `${CachePrefix.CHATS_PINNED_PREFIX}${topicId}`;
    const cached = await redisService.getCache(cacheKey);
    if (cached) {
      return cached;
    }
    const chats = await ChannelChat.find({ topic: topicId, pinned: true })
      .populate([
        { path: "user", select: "_id username name logo color_logo" },
        { path: "event", select: EVENT_SELECT_FIELDS },
      ])
      .lean();
    if (chats.length > 0) {
      await redisService.setCache(cacheKey, chats, 3600);
    }
    return chats;
  },

  getResourceChats: async function (topicId) {
    if (!topicId || !mongoose.Types.ObjectId.isValid(topicId)) return [];
    const cacheKey = `${CachePrefix.TOPIC_RESOURCE_PREFIX}${topicId}`;
    const cached = await redisService.getCache(cacheKey);
    if (cached) {
      return cached;
    }
    const chats = await ChannelChat.find({
      topic: topicId,
      media: { $elemMatch: { resource: true } },
    })
      .populate([
        { path: "user", select: "_id username name logo color_logo" },
        { path: "event", select: EVENT_SELECT_FIELDS },
      ])
      .lean();
    await redisService.setCache(cacheKey, chats, 3600);
    return chats;
  },
  addToResourceChats: async function (topicId, chat) {
    if (!topicId || !chat || !mongoose.Types.ObjectId.isValid(topicId)) return;
    const cacheKey = `${CachePrefix.TOPIC_RESOURCE_PREFIX}${topicId}`;
    const cached = await redisService.getCache(cacheKey);
    let chats = [];
    if (cached) {
      chats = cached;
      if (chats.some((c) => c._id === String(chat._id))) return;
    }
    chats.unshift(chat);
    await redisService.setCache(cacheKey, chats, 3600);
  },
  removeFromResourceChats: async function (topicId, chatId) {
    if (!topicId || !chatId || !mongoose.Types.ObjectId.isValid(topicId))
      return;
    const cacheKey = `${CachePrefix.TOPIC_RESOURCE_PREFIX}${topicId}`;
    const cached = await redisService.getCache(cacheKey);
    if (!cached) return;
    const chats = cached;
    const updatedChats = chats.filter((c) => String(c._id) !== String(chatId));
    await redisService.setCache(cacheKey, updatedChats, 3600);
  },
  //events
  async getTopicEvents(topicId) {
    const key = `${CachePrefix.TOPIC_EVENTS_PREFIX}${topicId}`;
    const cached = await redisService.getCache(key);
    if (cached) {
      return cached;
    }
    const events = await Event.find({ topic: topicId }).lean();
    await redisService.setCache(key, events, 3600);
    return events;
  },
  async addEventToTopic(topicId, event) {
    const key = `${CachePrefix.TOPIC_EVENTS_PREFIX}${topicId}`;
    const cached = await redisService.getCache(key);
    let events = cached ? cached : [];
    const plainEvent = event.toObject ? event.toObject() : event;
    events.push(plainEvent);
    await redisService.setCache(key, events, 3600);
  },
  async updateEventInTopic(topicId, event) {
    const key = `${CachePrefix.TOPIC_EVENTS_PREFIX}${topicId}`;
    const cached = await redisService.getCache(key);
    let events = cached ? cached : [];
    const updated = events.map((e) =>
      e._id?.toString?.() === event._id?.toString?.() ? event : e
    );
    await redisService.setCache(key, updated, 3600);
  },
  async removeEventFromTopic(topicId, eventId) {
    const key = `${CachePrefix.TOPIC_EVENTS_PREFIX}${topicId}`;
    const cached = await redisService.getCache(key);
    if (!cached) return;
    const events = cached.filter(
      (e) => e._id?.toString?.() !== eventId?.toString?.()
    );
    await redisService.setCache(key, events, 3600);
  },
  //event members
  async getEventMembers(eventId) {
    const key = `${CachePrefix.EVENT_MEMBERS_PREFIX}${eventId}`;
    const cached = await redisService.getCache(key);
    // if (cached) {
    //   return cached;
    // }
    const memberships = await EventMembership.find({
      event: eventId,
      status: "joined",
    })
      .select("user _id event role business")
      .populate([
        { path: "user", select: "_id username email name logo color_logo" },
      ])
      .lean();
    await redisService.setCache(key, memberships, 3600);
    return memberships;
  },
  async addMemberToEvent(eventId, membership) {
    const key = `${CachePrefix.EVENT_MEMBERS_PREFIX}${eventId}`;
    const cached = await redisService.getCache(key);
    let memberships = cached ? cached : [];
    const userId = membership?.user?._id?.toString?.();
    if (!userId) return;
    const exists = memberships.some(
      (m) => m?.user?._id?.toString?.() === userId
    );
    if (!exists) {
      memberships.push(membership);
      await redisService.setCache(key, memberships, 3600);
    }
  },
  async addMemberToEventBulk(eventId, memberships) {
    const key = `${CachePrefix.EVENT_MEMBERS_PREFIX}${eventId}`;
    const cached = await redisService.getCache(key);
    let cachedMemberships = cached ? cached : [];
    const existingUserIds = new Set(
      cachedMemberships.map((m) => m?.user?._id?.toString?.())
    );
    for (const membership of memberships) {
      const userId = membership?.user?._id?.toString?.();
      if (!userId || existingUserIds.has(userId)) continue;
      cachedMemberships.push(membership);
    }
    await redisService.setCache(key, cachedMemberships, 3600);
  },
  async removeMemberFromEvent(eventId, userId) {
    const key = `${CachePrefix.EVENT_MEMBERS_PREFIX}${eventId}`;
    const cached = await redisService.getCache(key);
    if (!cached) return;
    const memberships = cached;
    const filtered = memberships.filter(
      (m) => m?.user?._id?.toString?.() !== userId?.toString?.()
    );
    await redisService.setCache(key, filtered, 3600);
  },
  //requests
  async getEventRequests(eventId) {
    const key = `${CachePrefix.EVENT_REQUESTS_PREFIX}${eventId}`;
    const cached = await redisService.getCache(key);
    if (cached) {
      return cached;
    }
    const memberships = await EventMembership.find({
      event: eventId,
      status: "request",
    })
      .select("user _id event role business")
      .populate([{ path: "user", select: "_id username name logo color_logo" }])
      .lean();
    await redisService.setCache(key, memberships, 3600);
    return memberships;
  },
  async addRequestToEvent(eventId, membership) {
    const key = `${CachePrefix.EVENT_REQUESTS_PREFIX}${eventId}`;
    const cached = await redisService.getCache(key);
    let memberships = cached ? cached : [];
    const userId = membership?.user?._id?.toString?.();
    if (!userId) return;
    const exists = memberships.some(
      (m) => m?.user?._id?.toString?.() === userId
    );
    if (!exists) {
      memberships.push(membership);
      await redisService.setCache(key, memberships, 3600);
    }
  },
  async removeRequestFromEvent(eventId, userId) {
    const key = `${CachePrefix.EVENT_REQUESTS_PREFIX}${eventId}`;
    const cached = await redisService.getCache(key);
    if (!cached) return;
    const memberships = cached;
    const filtered = memberships.filter(
      (m) => m?.user?._id?.toString?.() !== userId?.toString?.()
    );
    await redisService.setCache(key, filtered, 3600);
  },
  //evnt memerbsip
  async getUserEventMemberships(topicId, userId) {
    const key = `${CachePrefix.EVENT_TOPIC_MEMBERSHIP_USER_PREFIX}${topicId}:${userId}`;
    const cached = await redisService.getCache(key);
    if (cached) {
      return cached;
    }
    const memberships = await EventMembership.find({
      topic: topicId,
      user: userId,
    }).lean();
    await redisService.setCache(key, memberships, 3600);
    return memberships;
  },

  async addUserEventMembership(topicId, userId, membership) {
    const key = `${CachePrefix.EVENT_TOPIC_MEMBERSHIP_USER_PREFIX}${topicId}:${userId}`;
    const cached = await redisService.getCache(key);
    let memberships = cached ? cached : [];
    const exists = memberships.some(
      (m) => m?.event?.toString?.() === membership?.event?.toString?.()
    );
    if (!exists) {
      memberships.push(membership);
      await redisService.setCache(key, memberships, 3600);
    }
  },
  async addUserEventMembershipBulk(topicId, userId, memberships) {
    const key = `${CachePrefix.EVENT_TOPIC_MEMBERSHIP_USER_PREFIX}${topicId}:${userId}`;
    const cached = await redisService.getCache(key);
    let cachedMemberships = cached ? cached : [];

    const existingEventIds = new Set(
      cachedMemberships.map((m) => m?.event?.toString?.())
    );

    for (const membership of memberships) {
      const eventId = membership?.event?.toString?.();
      if (!eventId || existingEventIds.has(eventId)) continue;
      cachedMemberships.push(membership);
    }

    await redisService.setCache(key, cachedMemberships, 3600);
  },

  async updateUserEventMembership(topicId, userId, updatedMembership) {
    const key = `${CachePrefix.EVENT_TOPIC_MEMBERSHIP_USER_PREFIX}${topicId}:${userId}`;
    const cached = await redisService.getCache(key);
    let memberships = cached ? cached : [];

    const updated = memberships.map((m) =>
      m?.event?.toString?.() === updatedMembership?.event?.toString?.()
        ? updatedMembership
        : m
    );
    await redisService.setCache(key, updated, 3600);
  },

  async removeUserEventMembership(topicId, userId, eventId) {
    const key = `${CachePrefix.EVENT_TOPIC_MEMBERSHIP_USER_PREFIX}${topicId}:${userId}`;
    const cached = await redisService.getCache(key);
    if (!cached) return;

    const memberships = cached;
    const filtered = memberships.filter(
      (m) => m?.event?.toString?.() !== eventId?.toString?.()
    );
    await redisService.setCache(key, filtered, 3600);
  },
  async getOrCacheEventMembership(eventId, userId) {
    const key = `${CachePrefix.EVENT_MEMBERSHIP_PREFIX}${eventId}:${userId}`;
    const cached = await redisService.getCache(key);
    if (cached) {
      return cached;
    }
    const membership = await EventMembership.findOne({
      event: eventId,
      user: userId,
    }).lean();
    await redisService.setCache(key, membership, 3600);
    return membership;
  },
  async updateEventMembershipCache(eventId, userId, membership) {
    const key = `${CachePrefix.EVENT_MEMBERSHIP_PREFIX}${eventId}:${userId}`;
    await redisService.setCache(key, membership, 3600);
  },

  //polls
  async getOrCacheTopicPolls(topicId) {
    const key = `${CachePrefix.TOPIC_POLLS_PREFIX}${topicId}`;
    const cached = await redisService.getCache(key);
    if (cached) {
      return cached;
    }
    const polls = await Poll.find({
      topic: topicId,
      isClosed: false,
    });
    await redisService.setCache(key, polls, 3600);
    return polls;
  },
  async addPollToTopic(topicId, poll) {
    const key = `${CachePrefix.TOPIC_POLLS_PREFIX}${topicId}`;
    const cached = await redisService.getCache(key);
    let polls = cached ? cached : [];
    polls.push(poll);
    await redisService.setCache(key, polls, 3600);
  },
  async removePollFromTopic(topicId, pollId) {
    const key = `${CachePrefix.TOPIC_POLLS_PREFIX}${topicId}`;
    const cached = await redisService.getCache(key);
    if (!cached) return;
    const polls = cached.filter((p) => p._id.toString() !== pollId.toString());
    await redisService.setCache(key, polls, 3600);
  },
  async getPollVoteSummary(pollId) {
    const summaries = await this.getMultiplePollVoteSummaries([pollId]);
    return summaries[pollId] || {};
  },
    async incrementPollChoiceCount(pollId, choice) {
    const key = `${CachePrefix.POLL_VOTE_COUNTS_PREFIX}${pollId}`;
    const current = await redisClient.get(key);
    let summary = current ? JSON.parse(current) : {};
    summary[choice] = (summary[choice] || 0) + 1;
    await redisClient.set(key, JSON.stringify(summary), "EX", 3600);
  },
  async getMultiplePollVoteSummaries(pollIds) {
    const redisKeys = pollIds.map(
      (id) => `${CachePrefix.POLL_VOTE_COUNTS_PREFIX}${id}`
    );
    const redisResults = await redisClient.mget(redisKeys);

    const summaryMap = {};
    const missingPolls = [];

    pollIds.forEach((id, i) => {
      const cached = redisResults[i];
      if (cached) {
        summaryMap[id] = JSON.parse(cached);
      } else {
        summaryMap[id] = {};
        missingPolls.push(id);
      }
    });
    if (missingPolls.length > 0) {
      const dbResults = await PollVote.aggregate([
        {
          $match: {
            poll: {
              $in: missingPolls.map((id) => new mongoose.Types.ObjectId(id)),
            },
          },
        },
        {
          $group: {
            _id: { poll: "$poll", choice: "$choice" },
            count: { $sum: 1 },
          },
        },
      ]);
      const pollGrouped = {};
      for (const { _id, count } of dbResults) {
        const pollId = _id.poll.toString();
        const choice = _id.choice;
        if (!pollGrouped[pollId]) pollGrouped[pollId] = {};
        pollGrouped[pollId][choice] = count;
      }

      for (const pollId of missingPolls) {
        const summary = pollGrouped[pollId] || {};
        summaryMap[pollId] = summary;
        const jsonKey = `${CachePrefix.POLL_VOTE_COUNTS_PREFIX}${pollId}`;
        await redisClient.set(jsonKey, JSON.stringify(summary), "EX", 3600);
      }
    }
    return summaryMap;
  },
  async hasVoted(pollId, userId, ip) {
    const voteMap = await this.getUserPollVoteRecords([pollId], userId, ip);
    return voteMap[pollId];
  },

  async setUserVoted(pollId, userId, ip, choice) {
    const key = `${CachePrefix.POLL_USER_VOTE_PREFIX}${pollId}:${userId || ip}`;
    await redisService.setCache(key, choice, 3600);
  },

  async getUserPollVoteRecords(pollIds, userId, ip) {
    const voteKeys = pollIds.map(
      (id) => `${CachePrefix.POLL_USER_VOTE_PREFIX}${id}:${userId || ip}`
    );

    const redisResults = await redisClient.mget(voteKeys);

    const recordMap = {};
    const missingPolls = [];

    pollIds.forEach((pollId, i) => {
      if (redisResults[i]) {
        recordMap[pollId] = redisResults[i];
      } else {
        recordMap[pollId] = null;
        missingPolls.push(pollId);
      }
    });

    if (missingPolls.length > 0) {
      const dbVotes = await PollVote.find({
        poll: { $in: missingPolls },
        ...(userId ? { user: userId } : { ip }),
      }).lean();

      for (const vote of dbVotes) {
        const key = `${CachePrefix.POLL_USER_VOTE_PREFIX}${vote.poll}:${
          userId || ip
        }`;
        recordMap[vote.poll.toString()] = vote.choice;
        await redisService.setCache(key, vote.choice, 3600);
      }
    }

    return recordMap;
  },
};

module.exports = RedisHelper;
