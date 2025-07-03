require("dotenv").config();
const sharp = require("sharp");
const path = require("path");
var mongoose = require("mongoose");
var Topic = mongoose.model("Topic");
var ChannelChat = mongoose.model("ChannelChat");
var TopicMembership = mongoose.model("TopicMembership");
var ChannelMembership = mongoose.model("ChannelMembership");
var Event = mongoose.model("Event");
var Poll = mongoose.model("Poll");
var Summary = mongoose.model("Summary");
const Invite = mongoose.model("Invite");
const EventMembership = mongoose.model("EventMembership");
var Channel = mongoose.model("Channel");
var User = mongoose.model("User");
const redisService = require("../services/redisService");
const rabbitmqService = require("../services/rabbitmqService");
const chatRabbitmqService = require("../services/chatRabbitmqService");
const emailRabbitmqService = require("../services/emailRabbitmqService");
const {
  uploadMultipleImages,
  uploadMultipleImagesChips,
  deleteImageFromS3,
  uploadFileToS3,
  uploadMultipleVideos,
  generateThumbnail,
  apiMetadata,
  apiMetadata2,
} = require("../aws/uploads/Images");

const TOPIC_PREFIX = "topic:";
const TOPICS_ALL_CHANNEL_PREFIX = "topics:all:channel:";
const TOPICS_MEMBERS_PREFIX = "topics:members:";
const TOPIC_MEMBERSHIP_PREFIX = "topic:membership:";

const CHANNEL_PREFIX = "channel:";
const CHANNELS_CREATED_PREFIX = "channels:created:";
const CHANNELS_MEMBERS_PREFIX = "channels:members:";
const CHANNELS_MEMBERSHIP_PREFIX = "channels:membership:";
const CHANNELS_MEMBERS_COUNT_PREFIX = "channels:members:count:";

exports.create_topic = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { channel, name, editability, visibility, paywallPrice } = req.body;

  if (!user_id) {
    return res.json({
      success: false,
      message: "User id is required.",
    });
  }
  if (!channel || !name) {
    return res.json({
      success: false,
      message: "Channel and topic name are required.",
    });
  }
  try {
    const channelDoc = await Channel.findById(channel);
    const topic_exist = await Topic.findOne({
      name: name,
      user: user_id,
      channel: channel,
    });
    if (topic_exist) {
      return res.json({
        success: false,
        message: "Topic name already exist.",
      });
    }
    const topic_data = {
      user: user_id,
      name: name,
      channel: channel,
      business: channelDoc.business,
      editability: editability,
      visibility: visibility,
      paywallPrice: paywallPrice,
    };
    const topic = await Topic.create(topic_data);
    const user = await User.findById(user_id).select("email").lean();
    const myMembership = await TopicMembership.create({
      channel: channelDoc._id,
      topic: topic._id,
      user: user_id,
      role: "owner",
      email: user.email,
      status: "joined",
    });
    const id = topic._id;
    if (channelDoc) {
      channelDoc.topics.push(id);
      await channelDoc.save();
    }
    const topicsAllChannelCacheKey = `${TOPICS_ALL_CHANNEL_PREFIX}${channel}`;
    const createdChannelsCacheKey = `${CHANNELS_CREATED_PREFIX}${user_id}`;
    const channelCacheKey = `${CHANNEL_PREFIX}${channel}`;
    await rabbitmqService.publishInvalidation(
      [topicsAllChannelCacheKey, createdChannelsCacheKey, channelCacheKey],
      "topic"
    );
    return res.json({
      success: true,
      message: "Topic created successfully",
      topic: {
        ...topic.toObject(),
        members: [myMembership],
      },
    });
  } catch (error) {
    res.json({ error: "Topic can't be created." });
  }
};

exports.createGeneralTopic = async function (req, res) {
  const { channelId } = req.body;
  const user_id = res.locals.verified_user_id;

  if (!channelId || !mongoose.Types.ObjectId.isValid(channelId) || !user_id) {
    return res.json({
      success: false,
      message: "Invalid or missing channelId",
    });
  }

  try {
    const channel = await Channel.findById(channelId)
      .select("_id business")
      .lean();
    if (!channel) {
      return res.json({ success: false, message: "Channel not found" });
    }
    const existingTopic = await Topic.findOne({
      name: "general",
      channel: channelId,
    }).lean();
    if (existingTopic) {
      return res.json({
        success: false,
        message: "Topic name general already exists in this channel",
      });
    }
    const topic_data = {
      name: "general",
      channel: channelId,
      user: user_id,
      business: channel.business || null,
    };
    const newTopic = await Topic.create(topic_data);
    channel.topics.push(newTopic._id);
    await channel.save();
    const user = await User.findById(user_id).select("email").lean();
    const myMembership = await TopicMembership.create({
      channel: channelId,
      topic: newTopic._id,
      user: user_id,
      role: "owner",
      email: user.email,
      status: "joined",
    });
    const createdChannelsCacheKey = `${CHANNELS_CREATED_PREFIX}${user_id}`;
    const channelCacheKey = `${CHANNEL_PREFIX}${channelId}`;
    const topicsChannelCacheKey = `${TOPICS_ALL_CHANNEL_PREFIX}${channelId}`;
    await redisService.setCache(
      `${TOPIC_MEMBERSHIP_PREFIX}${newTopic._id}:${user_id}`,
      myMembership,
      3600
    );
    await rabbitmqService.publishInvalidation(
      [createdChannelsCacheKey, channelCacheKey, topicsChannelCacheKey],
      "topic"
    );
    return res.json({
      success: true,
      message: "Topic created successfully",
      topic: {
        ...newTopic.toObject(),
        members: [myMembership],
      },
    });
  } catch (error) {
    console.error("Failed to create topic:", error);
    res.json({ success: false, message: "Failed to create topic" });
  }
};

exports.update_topic = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { _id, name, editability, visibility, paywallPrice } = req.body;
  if (!user_id || !_id) {
    return res.json({
      success: false,
      message: "ID is required.",
    });
  }

  try {
    const topic = await Topic.findById(_id);
    if (!topic || topic.user.toString() !== user_id.toString()) {
      return res.json({
        success: false,
        message: "Topic not found or you are not the owner.",
      });
    }

    const updatedTopic = await Topic.findByIdAndUpdate(
      _id,
      {
        ...(name && { name }),
        ...(editability && { editability }),
        ...(visibility && { visibility }),
        paywallPrice: paywallPrice,
      },
      { new: true }
    );
    let myMembership = null;
    const cacheKey = `${TOPIC_MEMBERSHIP_PREFIX}${_id}:${user_id}`;
    myMembership = await redisService.getCache(cacheKey);
    if (!myMembership) {
      myMembership = await TopicMembership.findOne({
        topic: _id,
        channel: topic.channel,
        user: user_id,
      }).lean();
    }
    const topicsAllChannelCacheKey = `${TOPICS_ALL_CHANNEL_PREFIX}${topic.channel}`;
    const createdChannelsCacheKey = `${CHANNELS_CREATED_PREFIX}${user_id}`;
    const channelCacheKey = `${CHANNEL_PREFIX}${topic.channel}`;
    const topicCacheKey = `${TOPIC_PREFIX}${_id}`;

    await rabbitmqService.publishInvalidation(
      [
        topicsAllChannelCacheKey,
        createdChannelsCacheKey,
        channelCacheKey,
        topicCacheKey,
      ],
      "topic"
    );
    return res.json({
      success: true,
      message: "Topic updated successfully.",
      topic: {
        ...updatedTopic.toObject(),
        members: [myMembership],
      },
    });
  } catch (error) {
    return res.json({
      success: false,
      message: "An error occurred while updating the topic.",
    });
  }
};

exports.fetch_topic_members = async function (req, res, next) {
  const { topicId } = req.body;
  const user_id = res.locals.verified_user_id;
  if (!topicId || !mongoose.Types.ObjectId.isValid(topicId) || !user_id) {
    return res.json({
      success: false,
      message: "Invalid or missing topicId",
    });
  }
  try {
    const cacheKey = `${TOPICS_MEMBERS_PREFIX}${topicId}`;
    const cachedMembers = await redisService.getCache(cacheKey);
    if (cachedMembers) {
      return res.json({
        success: true,
        message: "Members fetched successfully",
        members: cachedMembers,
      });
    }
    const topicMembers = await TopicMembership.find({
      topic: topicId,
      user: { $ne: null },
      status: "joined",
      role: { $ne: "owner" },
    })
      .populate({ path: "user", select: "name username _id logo color_logo" })
      .lean();
    await redisService.setCache(cacheKey, topicMembers, 7200);
    res.json({
      success: true,
      message: "Members fetched successfully",
      members: topicMembers,
    });
  } catch (error) {
    console.error("Error in fetching members", error);
    res.json({
      success: false,
      message: "Error in fetching members",
      error: error.message,
    });
  }
};

exports.fetch_my_channel_joined_topics = async function (req, res, next) {
  const user_id = res.locals.verified_user_id;
  const { channelId } = req.body;

  if (!user_id || !channelId) {
    return res.json({
      success: false,
      message: "Missing userId or channelId",
    });
  }

  try {
    const topicMemberships = await TopicMembership.find({
      channel: channelId,
      user: user_id,
      status: "joined",
    })
      .select("topic lastReadAt")
      .populate({
        path: "topic",
        select: "name _id editability visibility",
      })
      .lean();
    const enrichedTopics = await Promise.allSettled(
      topicMemberships.map(async (membership) => {
        const topic = membership.topic;
        if (!topic || !topic._id) return null;

        const lastReadAt = membership.lastReadAt || new Date(0);

        const unreadCount = await ChannelChat.countDocuments({
          topic: topic._id,
          createdAt: { $gt: lastReadAt },
        });
        return {
          ...topic,
          unreadCount,
        };
      })
    );

    const validTopics = enrichedTopics
      .filter((r) => r.status === "fulfilled" && r.value)
      .map((r) => r.value);

    return res.json({
      success: true,
      message: "Topics fetched successfully",
      topics: validTopics,
    });
  } catch (error) {
    console.error("Error in fetching topics:", error);
    res.status(500).json({
      success: false,
      message: "Error in fetching topics",
      error: error.message,
    });
  }
};

exports.fetch_all_channel_topics = async function (req, res, next) {
  const { channelId } = req.body;
  const user_id = res.locals.verified_user_id;

  if (!channelId || !mongoose.Types.ObjectId.isValid(channelId)) {
    return res.json({
      success: false,
      message: "Invalid or missing channelId",
    });
  }
  if (!user_id) {
    return res.json({
      success: false,
      message: "Invalid or missing userId",
    });
  }
  try {
    const topicCacheKey = `${TOPICS_ALL_CHANNEL_PREFIX}${channelId}`;
    let topicDocs = await redisService.getCache(topicCacheKey);
    let topicIds = [];
    if (!topicDocs) {
      const channel = await Channel.findById(channelId).select("topics").lean();
      if (!channel || !channel.topics?.length) {
        return res.json({
          success: true,
          message: "No topics found",
          topics: [],
        });
      }
      topicIds = channel.topics;
      topicDocs = await Topic.find({ _id: { $in: topicIds } }).lean();
      const topicMap = new Map(
        topicDocs.map((topic) => [topic._id.toString(), topic])
      );
      topicDocs = topicIds
        .map((id) => topicMap.get(id.toString()))
        .filter(Boolean);
      await redisService.setCache(topicCacheKey, topicDocs, 7200);
    } else {
      topicIds = topicDocs.map((t) => t._id);
    }
    const memberships = await TopicMembership.find({
      topic: { $in: topicIds },
      channel: channelId,
      user: user_id,
    }).lean();

    const membershipMap = new Map(
      memberships.map((m) => [m.topic.toString(), m])
    );

    const enrichedTopics = topicDocs.map((topic) => {
      const myMembership = membershipMap.get(topic._id.toString());
      return {
        ...topic,
        members: myMembership ? [myMembership] : [],
      };
    });
    return res.json({
      success: true,
      message: "Topics fetched successfully",
      topics: enrichedTopics,
    });
  } catch (error) {
    console.error("Error in fetching topics", error);
    res.status(500).json({
      success: false,
      message: "Error in fetching topics",
      error: error.message,
    });
  }
};

exports.fetch_topic = async function (req, res, next) {
  const { id } = req.body;
  const user_id = res.locals.verified_user_id;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.json({
      success: false,
      message: "Invalid Topic ID",
    });
  }
  try {
    const cacheKey = `${TOPIC_PREFIX}${id}`;
    const cacheTopicMembersKey = `${TOPIC_MEMBERSHIP_PREFIX}${id}:${user_id}`;
    const [cachedTopic, cachedMembership] = await Promise.all([
      redisService.getCache(cacheKey),
      redisService.getCache(cacheTopicMembersKey),
    ]);

    let myMembership = cachedMembership;
    if (!cachedMembership) {
      let channelId = cachedTopic?.channel;
      if (!channelId) {
        const topicData = await Topic.findById(id).select("channel").lean();
        if (!topicData) {
          return res.json({
            success: false,
            message: "No Topic found",
          });
        }
        channelId = topicData.channel;
      }
      myMembership = await TopicMembership.findOne({
        channel: channelId,
        topic: id,
        user: user_id,
      }).lean();
      if (myMembership) {
        await redisService.setCache(cacheTopicMembersKey, myMembership, 3600);
      }
    }
    if (cachedTopic) {
      return res.json({
        success: true,
        message: "Topic fetched successfully from cache",
        topic: {
          ...cachedTopic,
          members: [myMembership] || [],
        },
      });
    }
    const topic = await Topic.findById(id)
      .populate([
        { path: "user", select: "name username _id logo color_logo" },
        { path: "channel", select: "_id name visibility" },
      ])
      .lean();

    if (!topic) {
      return res.json({
        success: false,
        message: "No Topic found",
      });
    }
    await redisService.setCache(cacheKey, topic, 3600);
    return res.json({
      success: true,
      message: "Topic fetched successfully",
      topic: {
        ...topic,
        members: [myMembership],
      },
    });
  } catch (error) {
    console.error("Error in fetching topic", error);
    res.status(500).json({
      success: false,
      message: "Error in fetching topic",
      error: error.message,
    });
  }
};

exports.delete_topic = async function (req, res, next) {
  const { id } = req.body;
  const user_id = res.locals.verified_user_id;
  if (!id || !mongoose.Types.ObjectId.isValid(id) || !user_id) {
    return res.json({
      success: false,
      message: "Invalid Topic ID or User ID",
    });
  }
  try {
    const topic = await Topic.findById(id).lean();
    if (!topic || topic.user.toString() !== user_id.toString()) {
      return res.json({
        success: false,
        message: "Topic not found or you are not the owner.",
      });
    }
    await Topic.findByIdAndDelete(id);
    await Promise.all([
      TopicMembership.deleteMany({ topic: id }),
      ChannelChat.deleteMany({ topic: id }),
      Event.deleteMany({ topic: id }),
      Poll.deleteMany({ topic: id }),
      Summary.deleteMany({ topic: id }),
      EventMembership.deleteMany({ topic: id }),
    ]);
    const channel = await Channel.findById(topic.channel);
    if (channel) {
      channel.topics = channel.topics.filter(
        (topicId) => topicId.toString() !== id.toString()
      );
      await channel.save();
    }
    const topicCacheKey = `${TOPIC_PREFIX}${id}`;
    const topicsAllChannelCacheKey = `${TOPICS_ALL_CHANNEL_PREFIX}${topic.channel}`;
    const createdChannelsCacheKey = `${CHANNELS_CREATED_PREFIX}${user_id}`;
    const channelCacheKey = `${CHANNEL_PREFIX}${topic.channel}`;
    const topicMemberCacheKey = `${TOPICS_MEMBERS_PREFIX}${id}`;

    await rabbitmqService.publishInvalidation(
      [
        topicCacheKey,
        topicsAllChannelCacheKey,
        createdChannelsCacheKey,
        channelCacheKey,
        topicMemberCacheKey,
      ],
      "topic"
    );
    await chatRabbitmqService.publishInvalidation(
      [`${TOPIC_MEMBERSHIP_PREFIX}${id}:*`],
      "topic",
      "cache.delete.topic"
    );
    res.json({
      success: true,
      message: "Topic deleted successfully",
      topic: topic,
    });
  } catch (error) {
    console.error("Error in deleting topic", error);
    res.status(500).json({
      success: false,
      message: "Error in deleting topic",
      error: error.message,
    });
  }
};

exports.join_topic = async function (req, res, next) {
  const user_id = res.locals.verified_user_id;
  const { topicId } = req.body;

  try {
    const topic = await Topic.findById(topicId).lean();
    if (!topic) {
      return res.json({
        success: false,
        message: "Topic not found.",
      });
    }
    const existing = await TopicMembership.findOne({
      channel: topic.channel,
      topic: topicId,
      user: user_id,
    });
    if (existing) {
      if (existing.status === "joined") {
        return res.json({
          success: true,
          message: "You are already a member of this topic",
          joined: true,
          membership: existing,
          topic: topic,
        });
      } else {
        return res.json({
          success: false,
          message: "Request already sent. Please wait for approval.",
          joined: false,
        });
      }
    }
    const user = await User.findById(user_id).select("email").lean();

    const channelMembership = await ChannelMembership.findOne({
      channel: topic.channel,
      user: user_id,
    })
      .select("status")
      .lean();
    if (!channelMembership || channelMembership.status === "request") {
      return res.json({
        success: false,
        message:
          "You have not joined the channel. Please join the channel first.",
        joined: false,
      });
    }

    if (topic.visibility === "paid" && topic.paywallPrice) {
      return res.json({
        success: true,
        message: "This topic is paywalled. Please purchase the topic to join.",
        paywall: true,
        paywallPrice: topic.paywallPrice,
        membership: null,
        topic: topic,
        joined: false,
      });
    }
    if (topic.visibility === "anyone") {
      const membership = await TopicMembership.create({
        channel: topic.channel,
        topic: topicId,
        user: user_id,
        email: user.email,
        business: topic.business,
        status: "joined",
      });
      const cacheKey = `${TOPICS_MEMBERS_PREFIX}${topicId}`;
      await rabbitmqService.publishInvalidation([cacheKey], "topic");
      return res.json({
        success: true,
        message: "Topic joined successfully.",
        joined: true,
        membership: membership,
        topic: topic,
      });
    } else if (topic.visibility === "invite") {
      const membership = await TopicMembership.create({
        channel: topic.channel,
        topic: topicId,
        user: user_id,
        email: user.email,
        business: topic.business,
        status: "request",
      });
      await rabbitmqService.publishInvalidation(
        [
          `${TOPICS_MEMBERS_PREFIX}${topicId}`,
          `${TOPIC_MEMBERSHIP_PREFIX}${topicId}:${user_id}`,
        ],
        "topic"
      );
      return res.json({
        success: true,
        message: "Request sent successfully. Please wait for approval.",
        joined: false,
        membership: membership,
        topic: topic,
      });
    }
    return res.json({
      success: false,
      message: "Can't join private topic. Contact administartor for access",
    });
  } catch (error) {
    console.error("Error in joining topic:", error);
    return res.json({
      success: false,
      message: "Error in joining topic.",
      error: error.message,
    });
  }
};

exports.leave_topic = async function (req, res, next) {
  const user_id = res.locals.verified_user_id;
  const { topicId } = req.body;

  if (!user_id || !topicId) {
    return res.json({
      success: false,
      message: "Invalid topicId or userId.",
    });
  }
  try {
    const topic = await Topic.findById(topicId).select("channel _id").lean();
    if (!topic) {
      return res.json({
        success: false,
        message: "No topic found.",
      });
    }
    const membership = await TopicMembership.findOneAndDelete({
      topic: topicId,
      user: user_id,
      channel: topic.channel,
    });
    const topicMemberCacheKey = `${TOPICS_MEMBERS_PREFIX}${topicId}`;
    const topicCacheKey = `${TOPICS_ALL_CHANNEL_PREFIX}${topic.channel}`;

    await rabbitmqService.publishInvalidation(
      [
        topicMemberCacheKey,
        topicCacheKey,
        `${TOPIC_MEMBERSHIP_PREFIX}${topicId}:${user_id}`,
      ],
      "topic"
    );
    return res.json({
      success: true,
      topic: topic,
      membership: membership,
      message: "Topic left successfully",
    });
  } catch (error) {
    console.error("Error in leaving channel:", error);
    return res.json({
      success: false,
      message: "Error in leaving topic.",
      error: error.message,
    });
  }
};

exports.mark_as_read = async function (req, res, next) {
  const { topicId } = req.body;
  const user_id = res.locals.verified_user_id;

  if (!topicId) {
    return res.json({
      success: false,
      message: "Invalid or missing topicId",
    });
  }
  try {
    const updated = await TopicMembership.findOneAndUpdate(
      { topic: topicId, user: user_id },
      { $set: { lastReadAt: new Date() } },
      { new: false }
    );
    if (!updated) {
      return res.json({
        success: false,
        message: "No topic membership found",
      });
    }
    await rabbitmqService.publishInvalidation(
      [`${TOPIC_MEMBERSHIP_PREFIX}${topicId}:${user_id}`],
      "topic"
    );
    return res.json({
      success: true,
      message: "Marked as read",
    });
  } catch (error) {
    console.error("Error in marking as read", error);
    return res.status(500).json({
      success: false,
      message: "Error in marking as read",
      error: error.message,
    });
  }
};

exports.update_channel_topics_order = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { topicItems, channelId } = req.body;
  const items = JSON.parse(topicItems || "[]");

  if (!user_id || !channelId) {
    return res.json({
      success: false,
      message: "User or Channel not found!",
    });
  }

  try {
    const channel = await Channel.findOne({ _id: channelId, user: user_id });
    if (!channel) {
      return res.json({
        success: false,
        message: "Channel not found!",
      });
    }
    const channelCacheKey = `${CHANNEL_PREFIX}${channelId}`;
    const createdChannelsCacheKey = `${CHANNELS_CREATED_PREFIX}${user_id}`;
    const topicCacheKey = `${TOPICS_ALL_CHANNEL_PREFIX}${channelId}`;
    channel.topics = items.filter((item) => item._id);
    await channel.save();
    await channel.populate({
      path: "topics",
      select: "name _id visibility editability",
    });
    await rabbitmqService.publishInvalidation(
      [channelCacheKey, createdChannelsCacheKey, topicCacheKey],
      "topic"
    );

    return res.json({
      success: true,
      message: "Updated topics successfully!",
      topics: channel.topics,
      channelId: channelId,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Error updating topics",
      error: err.message,
    });
  }
};

exports.join_topic_invite = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { topicId, channelId, code } = req.body;

  try {
    const [topic, user, alreadyExistChannelMembership, alreadyExists, channel] =
      await Promise.all([
        Topic.findById(topicId).lean(),
        User.findById(user_id).select("email").lean(),
        ChannelMembership.findOne({ channel: channelId, user: user_id }).lean(),
        TopicMembership.findOne({
          topic: topicId,
          user: user_id,
          channel: channelId,
        }).lean(),
        Channel.findById(channelId)
          .populate([
            { path: "topics", select: "name _id editability visibility" },
            { path: "user", select: "name username _id logo color_logo" },
          ])
          .lean(),
      ]);
    if (!topic) {
      return res.json({
        success: false,
        message: "Topic not found.",
      });
    }
    if (
      alreadyExists &&
      alreadyExists.status === "joined" &&
      alreadyExistChannelMembership &&
      alreadyExistChannelMembership.status === "joined"
    ) {
      return res.json({
        success: true,
        message: "You are already a member of this topic.",
        topic: topic,
        membership: alreadyExists,
        channel: channel,
        joined: true,
      });
    }
    const invite = await Invite.findOne({
      topic: topicId,
      code: code,
      channel: channelId,
    });
    if (
      !invite ||
      invite.user.toString() !== topic.user._id.toString() ||
      invite.status === "expired" ||
      (invite.expire_time && invite.expire_time < new Date()) ||
      invite.usage_limit <= invite.used_by.length
    ) {
      return res.json({
        success: false,
        message: "Invalid or expired invite code.",
      });
    }
    if (invite.used_by.includes(user_id)) {
      return res.json({
        success: false,
        message: "You have already used this invite code.",
      });
    }
    invite.used_by.push(user_id);
    await invite.save();

    let channelMembership = null;
    if (!alreadyExistChannelMembership) {
      channelMembership = await ChannelMembership.create({
        channel: channelId,
        user: user_id,
        business: topic.business,
        email: user.email,
        status: "joined",
      });
    }
    if (
      alreadyExistChannelMembership &&
      alreadyExistChannelMembership.status === "request"
    ) {
      alreadyExistChannelMembership.status = "joined";
      channelMembership = await alreadyExistChannelMembership.save();
    }
    let topicmembership = null;
    if (!alreadyExists) {
      topicmembership = await TopicMembership.create({
        topic: topicId,
        user: user_id,
        email: user.email,
        business: topic.business,
        channel: channelId,
        status: "joined",
      });
    }
    if (alreadyExists && alreadyExists.status === "request") {
      alreadyExists.status = "joined";
      topicmembership = await alreadyExists.save();
    }
    await rabbitmqService.publishInvalidation(
      [
        `${CHANNELS_MEMBERS_PREFIX}${channelId}`,
        `${CHANNELS_MEMBERSHIP_PREFIX}${channelId}:${user_id}`,
        `${CHANNELS_MEMBERS_COUNT_PREFIX}${channelId}`,
        `${TOPICS_MEMBERS_PREFIX}${topicId}`,
        `${TOPIC_MEMBERSHIP_PREFIX}${topicId}:${user_id}`,
      ],
      "topic"
    );

    return res.json({
      success: true,
      message: "Topic joined successfully.",
      topic: topic,
      membership: topicmembership,
      channel: channel,
      joined: true,
    });
  } catch (error) {
    console.error("join_topic_invite error:", error);
    return res.json({
      success: false,
      message: "Failed to join invite.",
      error: error.message,
    });
  }
};

exports.accept_topic_request = async function (req, res, next) {
  const { topicId, userId, email } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    const topic = await Topic.findById(topicId)
      .select("user _id channel name")
      .populate([
        { path: "channel", select: "_id name logo" },
        { path: "user", select: "_id username" },
      ])
      .lean();
    if (!topic || topic.user._id.toString() !== user_id.toString()) {
      return res.json({
        success: false,
        message: "No topic found or you are not the owner.",
      });
    }
    await TopicMembership.findOneAndUpdate(
      { topic: topicId, user: userId, status: "request" },
      { status: "joined" },
      { new: true }
    ).lean();
    const membersCacheKey = `${TOPICS_MEMBERS_PREFIX}${topicId}`;
    await rabbitmqService.publishInvalidation(
      [membersCacheKey, `${TOPIC_MEMBERSHIP_PREFIX}${topicId}:${user_id}`],
      "topic"
    );
    if (email && email !== "") {
      emailRabbitmqService.sendEmailMessage({
        to: email,
        channelId: topic.channel._id,
        topicId: topicId,
        topicName: topic.name,
        channelName: topic.channel.name,
        username: topic.user.username,
        logo:
          topic.channel.logo ||
          "https://d3i6prk51rh5v9.cloudfront.net/channel_cover.png",
        eventId: "",
        eventName: "",
      });
    }
    return res.json({
      success: true,
      message: "Topic joined successfully.",
      topicId: topicId,
      userId: userId,
    });
  } catch (error) {
    console.error("Error in joining channel:", error);
    return res.status(500).json({
      success: false,
      message: "Error in joining channel.",
      error: error.message,
    });
  }
};

exports.decline_topic_request = async function (req, res, next) {
  const { topicId, userId } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    const topic = await Topic.findById(topicId).select("user _id").lean();
    if (!topic || topic.user.toString() !== user_id.toString()) {
      return res.json({
        success: false,
        message: "No topic found or you are not the owner.",
      });
    }
    const existingRequest = await TopicMembership.findOne({
      topic: topicId,
      user: userId,
      status: "request",
    });
    if (existingRequest) {
      await existingRequest.deleteOne();
    }
    const membersCacheKey = `${TOPICS_MEMBERS_PREFIX}${topicId}`;
    await rabbitmqService.publishInvalidation(
      [membersCacheKey, `${TOPIC_MEMBERSHIP_PREFIX}${topicId}:${user_id}`],
      "topic"
    );
    return res.json({
      success: true,
      message: "Topic request declined successfully.",
      topicId: topicId,
      userId: userId,
    });
  } catch (error) {
    console.error("Error in declining topic request:", error);
    return res.status(500).json({
      success: false,
      message: "Error in declining topic request.",
      error: error.message,
    });
  }
};
