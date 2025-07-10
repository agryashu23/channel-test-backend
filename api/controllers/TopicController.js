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
const redisClient = require("../../utils/redisClient");
const RedisHelper = require("../../utils/redisHelpers");
const {CachePrefix} = require("../../utils/prefix");

const TOPIC_BASIC_FIELDS = "_id name visibility editability paywallPrice channel description user business";

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

    const [channelDoc,user,topic_exist,channelMembership] = await Promise.all([
      Channel.findById(channel).select("_id business topics user").populate({path:"user",select:"_id username name "}),
      User.findById(user_id).select("email").lean(),
      Topic.findOne({
        name: name,
        user: user_id,
        channel: channel,
      }).lean(),
      RedisHelper.getChannelMembership(user_id,channel),
    ]);
    if (topic_exist) {
      return res.json({
        success: false,
        message: "Topic name already exist.",
      });
    }

    if(!channelMembership || (channelMembership.role !== "owner" && channelMembership.role !== "admin")){
      return res.json({
        success: false,
        message: "You don't have permission to create topic in this channel.",
      });
    }

    let topicsCount = await RedisHelper.getTopicsCount(channel);
    let myPlan = await RedisHelper.getBusinessPlan(channelDoc.business);
    if((!myPlan && topicsCount >= 2) || (myPlan && myPlan.features.maxTopics<=topicsCount)){
      if(user.business){
      await emailRabbitmqService.sendNotificationMessage({
        type: "admin_notification",
        business: user.business,
        buttonText: "",
        buttonLink: `/account/billing`,
        content: `You have reached the maximum number of topic in channel ${channelDoc.name}. Upgrade your plan to add more.`,
      });
    }
      return res.json({
        success: true,
        isBusiness: user.business?true:false,
        limitReached: true,
        username:channelDoc.user?.username,
        message: `You have reached the maximum number of topic in channel ${channelDoc.name}. Upgrade your plan to add more.`,
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
    const myMembership = await TopicMembership.create({
      channel: channelDoc._id,
      topic: topic._id,
      user: user_id,
      role: channelMembership.role,
      email: user.email,
      business: channelDoc.business,
      status: "joined",
    });
    const id = topic._id;
    if (channelDoc) {
      channelDoc.topics.push(id);
      await channelDoc.save();
    }
    // const topicsAllChannelCacheKey = `${CachePrefix.TOPICS_ALL_CHANNEL_PREFIX}${channel}`;
    const createdChannelsCacheKey = `${CachePrefix.CHANNELS_CREATED_PREFIX}${user_id}`;
    const channelCacheKey = `${CachePrefix.CHANNEL_PREFIX}${channel}`;

    await Promise.all([
      RedisHelper.addTopicToChannel(channel, topic),
      RedisHelper.incrementTopicsCount(channel),
    ]);
    await rabbitmqService.publishInvalidation(
      [createdChannelsCacheKey,channelCacheKey],
      "topic"
    );
    await emailRabbitmqService.sendTopicAdminMembershipJob(
      { topicId: topic._id, channelId: channel, 
        creatorId: user_id, business: channelDoc.business || null }
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
    res.json({success:false,message:error.message, error: "Topic can't be created." });
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
    const [channel,user,existingTopic,channelMembership] = await Promise.all([
      Channel.findById(channelId).select("_id business topics"),
      User.findById(user_id).select("email").lean(),
      Topic.findOne({
        name: "general",
        channel: channelId,
      }).lean(),
      RedisHelper.getChannelMembership(user_id,channelId),
    ]);
    if (!channel) {
      return res.json({ success: false, message: "Channel not found" });
    }
    if (existingTopic) {
      return res.json({
        success: false,
        message: "Topic name general already exists in this channel",
      });
    }
    if(!channelMembership || (channelMembership.role !== "owner" && channelMembership.role !== "admin")){
      return res.json({
        success: false,
        message: "You don't have permission to create topic in this channel.",
      });
    }
    const topic_data = {
      name: "general",
      channel: channelId,
      user: user_id,
      business: channel.business || null,
      visibility: "anyone",
      editability: "anyone",
      paywallPrice: 0,
    };
    const newTopic = await Topic.create(topic_data);
    
    const myMembership = await TopicMembership.create({
      channel: channelId,
      topic: newTopic._id,
      user: user_id,
      role: channelMembership.role,
      business: channel.business || null,
      email: user.email,
      status: "joined",
    });

    if(channel){
      channel.topics.push(newTopic._id);
      await channel.save();
    }
    const createdChannelsCacheKey = `${CachePrefix.CHANNELS_CREATED_PREFIX}${user_id}`;
    const channelCacheKey = `${CachePrefix.CHANNEL_PREFIX}${channelId}`;
    // const topicsChannelCacheKey = `${CachePrefix.TOPICS_ALL_CHANNEL_PREFIX}${channelId}`;
    await Promise.all([
      RedisHelper.addTopicToChannel(channelId, newTopic),
      RedisHelper.incrementTopicsCount(channelId),
    ]);
    await emailRabbitmqService.sendTopicAdminMembershipJob(
      { topicId: newTopic._id, channelId: channelId, 
        creatorId: user_id, business: channel.business || null }
    );
    await rabbitmqService.publishInvalidation(
      [createdChannelsCacheKey,channelCacheKey],
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
    const [topic,ownership] = await Promise.all([
      RedisHelper.getOrCacheTopic(_id,`${CachePrefix.TOPIC_PREFIX}${_id}`),
      RedisHelper.getTopicMembership(user_id,_id),
    ]);
    if(!topic || (!ownership || (ownership.role !== "owner" && ownership.role !== "admin"))){
      return res.json({
        success: false,
        message: "Topic not found or you don't have authority to update this topic.",
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
   
    const channelCacheKey = `${CachePrefix.CHANNEL_PREFIX}${topic.channel?._id}`;
    const topicCacheKey = `${CachePrefix.TOPIC_PREFIX}${_id}`;
    await RedisHelper.updateTopicInChannel(topic.channel?._id, updatedTopic);
    await rabbitmqService.publishInvalidation(
      [
        channelCacheKey,
        topicCacheKey,
      ],
      "topic"
    );
    await updatedTopic.populate([
      { path: "channel", select: "name _id visibility" },
      { path: "user", select: "name username _id logo color_logo" },
    ]);
    return res.json({
      success: true,
      message: "Topic updated successfully.",
      topic: {
        ...updatedTopic.toObject(),
        members: [ownership],
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
    const ownership = await RedisHelper.getTopicMembership(user_id, topicId);
    if(!ownership || (ownership.role !== "owner" && ownership.role !== "admin")){
      return res.json({
        success: false,
        message: "You do not have permission to view this topic.",
      });
    }
    const cachedMembers = await RedisHelper.getTopicMembers(topicId);
    if (cachedMembers.length>0) {
      return res.json({
        success: true,
        message: "Members fetched successfully from cache",
        members: cachedMembers || [],
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
      await RedisHelper.setTopicMembersHash(topicId, topicMembers);
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

exports.fetch_topic_requests = async function (req, res, next) {
  const { topicId } = req.body;
  const user_id = res.locals.verified_user_id;
  if (!topicId || !mongoose.Types.ObjectId.isValid(topicId) || !user_id) {
    return res.json({
      success: false,
      message: "Invalid or missing topicId",
    });
  }
  try {
    const ownership = await RedisHelper.getTopicMembership(user_id, topicId);
    if(!ownership || (ownership.role !== "owner" && ownership.role !== "admin")){
      return res.json({
        success: false,
        message: "You do not have permission to view this topic.",
      });
    }
    const cachedRequests = await RedisHelper.getTopicRequests(topicId);
    if (cachedRequests.length>0) {
      return res.json({
        success: true,
        message: "Requests fetched successfully from cache",
        requests: cachedRequests || [],
      });
    }
    const topicRequests = await TopicMembership.find({
      topic: topicId,
      user: { $ne: null },
      status: "request", 
      role: { $nin: ["owner","admin"] },
    })
      .populate([{ path: "user", select: "name username _id logo color_logo" },{path: "topic", select: "name _id"}])
      .lean();
    await RedisHelper.setTopicRequestsHash(topicId, topicRequests);
    res.json({
      success: true,
      message: "Requests fetched successfully",
      requests: topicRequests || [],
    });
  } catch (error) {
    console.error("Error in fetching requests", error);
    res.json({
      success: false,
      message: "Error in fetching requests",
      error: error.message,
    });
  }
};

exports.remove_topic_member = async function (req, res, next) {
  const user_id = res.locals.verified_user_id;
  const { topicId, userId } = req.body;
  if (!topicId || !userId) {
    return res.json({
      success: false,
      message: "Invalid Topic ID or User ID",
    });
  }
  try {
    const ownership = await RedisHelper.getTopicMembership(user_id, topicId);
    if (!ownership || (ownership.role !== "owner" && ownership.role !== "admin")) {
      return res.json({
        success: false,
        message: "You don't have authority to remove this member.",
      });
    }
    const membership = await TopicMembership.findOneAndDelete({
      topic: topicId,
      user: userId,
      status: "joined",
    });
    await RedisHelper.removeUserFromTopic(topicId, userId);
    await rabbitmqService.publishInvalidation(
      [, `${CachePrefix.TOPIC_MEMBERSHIP_USER_PREFIX}${topicId}:${userId}`],
      "topic"
    );
    return res.json({
      success: true,
      message: "Member removed from topic",
      // topic: topic,
      membership: membership,
    });
  } catch (error) {
    console.error("Error in removing member:", error);
    res.status(500).json({
      success: false,
      message: "Error in removing member from channel",
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
    const topicIds = topicMemberships
      .map((m) => m.topic?._id?.toString())
      .filter(Boolean);

    const lastReadMap = Object.fromEntries(
      topicMemberships.map((m) => [
        m.topic?._id?.toString(),
        m.lastReadAt || new Date(0),
      ])
    );
    const unreadCountsAgg = await ChannelChat.aggregate([
      {
        $match: {
          topic: { $in: topicIds.filter(Boolean).map(id => new mongoose.Types.ObjectId(id)) },
          createdAt: {
            $gte: new Date(
              Math.min(...Object.values(lastReadMap).map((d) => d.getTime()))
            ),
          },
        },
      },
      {
        $group: {
          _id: "$topic",
          count: { $sum: 1 },
        },
      },
    ]);
    const unreadCountMap = Object.fromEntries(
      unreadCountsAgg.map((item) => [item._id.toString(), item.count])
    );
    const enrichedTopics = topicMemberships.map((m) => {
      const topic = m.topic;
      if (!topic || !topic._id) return null;

      const topicId = topic._id.toString();
      const unreadCount = unreadCountMap[topicId] || 0;

      return {
        ...topic,
        unreadCount,
      };
    }).filter(Boolean);

    return res.json({
      success: true,
      message: "Topics fetched successfully",
      topics: enrichedTopics,
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



exports.fetch_all_channel_topics = async function (req, res) {
  const { channelId } = req.body;
  const user_id = res.locals.verified_user_id;

  if (!channelId || !mongoose.Types.ObjectId.isValid(channelId) || !user_id) {
    return res.json({
      success: false,
      message: "Invalid userId or missing channelId",
    });
  }

  try {
    const channel = await Channel.findById(channelId).select("topics").lean();
    if (!channel || !channel.topics?.length) {
      return res.json({
        success: true,
        message: "No topics found",
        topics: [],
      });
    }

    const topicIds = channel.topics.map(id => id.toString());

    let topicDocs = await RedisHelper.getAllChannelTopics(channelId, topicIds);

    if (!topicDocs || topicDocs.length === 0) {
      const rawTopics = await Topic.find({ _id: { $in: topicIds } })
        .select(TOPIC_BASIC_FIELDS)
        .lean();

      const topicMap = new Map(rawTopics.map(t => [t._id.toString(), t]));
      topicDocs = topicIds.map(id => topicMap.get(id)).filter(Boolean);

      await RedisHelper.setChannelTopicsHash(channelId, topicDocs);
    }
    const memberships = await TopicMembership.find({
      topic: { $in: topicIds },
      channel: channelId,
      user: user_id,
    }).lean();

    const membershipMap = new Map(memberships.map(m => [m.topic.toString(), m]));

    const enrichedTopics = topicDocs.map(topic => ({
      ...topic,
      members: membershipMap.has(topic._id.toString()) ? [membershipMap.get(topic._id.toString())] : [],
    }));

    return res.json({
      success: true,
      message: "Topics fetched successfully",
      topics: enrichedTopics,
    });

  } catch (error) {
    console.error("Error in fetching topics", error);
    return res.status(500).json({
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
    const cacheKey = `${CachePrefix.TOPIC_PREFIX}${id}`;
    const [topic, myMembership] = await Promise.all([
      RedisHelper.getOrCacheTopic(id, cacheKey),
      RedisHelper.getTopicMembership(user_id, id),
    ]);
    if (!topic) {
      return res.json({
        success: false,
        message: "No Topic found",
      });
    }
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
    const ownership = await RedisHelper.getTopicMembership(user_id, id);
    if(!ownership || (ownership.role !== "owner" && ownership.role !== "admin")){
      return res.json({
        success: false,
        message: "You don't have authority to delete this topic.",
      });
    };
    const topic = await Topic.findByIdAndDelete(id);
    console.log(topic);
    await Promise.all([
      TopicMembership.deleteMany({ topic: id }),
      ChannelChat.deleteMany({ topic: id }),
      Event.deleteMany({ topic: id }),
      Poll.deleteMany({ topic: id }),
      Summary.deleteMany({ topic: id }),
      EventMembership.deleteMany({ topic: id }),
    ]);
    const channel = await Channel.findById(topic.channel).select("topics");
    if (channel) {
      channel.topics = channel.topics.filter(
        (topicId) => topicId.toString() !== id.toString()
      );
      await channel.save();
    }
    const topicCacheKey = `${CachePrefix.TOPIC_PREFIX}${id}`;
    const createdChannelsCacheKey = `${CachePrefix.CHANNELS_CREATED_PREFIX}${user_id}`;
    const channelCacheKey = `${CachePrefix.CHANNEL_PREFIX}${topic.channel}`;
    const topicMemberCacheKey = `${CachePrefix.TOPICS_MEMBERS_PREFIX}${id}`;
    const topicRequestCacheKey = `${CachePrefix.TOPIC_REQUESTS_PREFIX}${id}`;
    await Promise.all([
      RedisHelper.decrementTopicsCount(topic.channel),
      RedisHelper.removeTopicFromChannel(topic.channel, id)
    ]);
    let cacheKeys2=[];
    if(topic.business){
      cacheKeys2.push(`${CachePrefix.TOPIC_BUSINESS_REQUESTS_PREFIX}${topic.business}`);
    }
    await rabbitmqService.publishInvalidation(
      [
        topicCacheKey,
        createdChannelsCacheKey,
        channelCacheKey,
        topicMemberCacheKey,
        topicRequestCacheKey,
        ...cacheKeys2,
      ],
      "topic"
    );
    await chatRabbitmqService.publishInvalidation(
      [`${CachePrefix.TOPIC_MEMBERSHIP_USER_PREFIX}${id}:*`],
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
    const topic = await RedisHelper.getOrCacheTopic(topicId, `${CachePrefix.TOPIC_PREFIX}${topicId}`);
    if (!topic) {
      return res.json({
        success: false,
        message: "Topic not found.",
      });
    }
    const [existing, user] = await Promise.all([
    RedisHelper.getTopicMembership(user_id, topicId),
    User.findById(user_id).select("email").lean(),
    ]);

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
    const channelMembership = await RedisHelper.getChannelMembership(user_id, topic.channel?._id);
    if (!channelMembership || channelMembership.status === "request") {
      return res.json({
        success: false,
        message:
          "You have not joined the channel. Please join the channel first.",
        joined: false,
      });
    }

    if (topic.visibility === "paid" && topic.paywallPrice && channelMembership.role !== "owner" && channelMembership.role !== "admin") {
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
    if (topic.visibility === "anyone" || channelMembership.role==="owner" || channelMembership.role==="admin") {
      const membership = await TopicMembership.create({
        channel: topic.channel?._id,
        topic: topicId,
        user: user_id,
        email: user.email,
        business: topic.business,
        status: "joined",
        role: channelMembership.role,
      });
      const request_membership  = membership.toObject();
      await membership.populate([
        { path: "user", select: "_id name username logo color_logo email" },
        { path: "topic", select: "_id name" },
      ]);
      await RedisHelper.addUserToTopic(topicId, membership);
      return res.json({
        success: true,
        message: "Topic joined successfully.",
        joined: true,
        membership: request_membership,
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
      const request_membership  = membership.toObject();
      await membership.populate([
        { path: "user", select: "_id name username logo color_logo email" },
        { path: "topic", select: "_id name" },
      ]);
      await RedisHelper.addUserToTopicRequest(topicId, membership);
      if(topic.business){
        await RedisHelper.appendRequestToBusinessArray(`${CachePrefix.TOPIC_BUSINESS_REQUESTS_PREFIX}${topic.business}`, membership,3600);
      }
      return res.json({
        success: true,
        message: "Request sent successfully. Please wait for approval.",
        joined: false,
        membership: request_membership,
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
    const topic = await RedisHelper.getOrCacheTopic(topicId, `${CachePrefix.TOPIC_PREFIX}${topicId}`);
    if (!topic) {
      return res.json({
        success: false,
        message: "No topic found.",
      });
    }
    
    const membership = await TopicMembership.findOneAndDelete({ topic: topicId, user: user_id });
    
    await RedisHelper.removeUserFromTopic(topicId, user_id);
    const cacheKeys = [
      `${CachePrefix.TOPIC_MEMBERSHIP_USER_PREFIX}${topicId}:${user_id}`,
    ];
    await rabbitmqService.publishInvalidation(cacheKeys, "topic");
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
    await RedisHelper.updateLastRead(topicId, user_id, new Date());
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
    const [ownership , channel] = await Promise.all([
      RedisHelper.getChannelMembership(user_id, channelId),
      Channel.findById(channelId).select("topics").populate({
        path: "topics",
        select: TOPIC_BASIC_FIELDS,
      }),
    ]);
    if(!ownership || (ownership.role !== "owner" && ownership.role !== "admin")){
      return res.json({
        success: false,
        message: "You are not authorized to update topics order.",
      });
    }
    if (!channel) {
      return res.json({
        success: false,
        message: "Channel not found!",
      });
    }

    const newOrder = items.map((item) => item._id).filter(Boolean).map(String);
    const currentOrder = (channel.topics || []).map(id => id.toString());
    const isSameOrder = newOrder.length === currentOrder.length && newOrder.every((id, i) => id === currentOrder[i]);
    if(isSameOrder){
      return res.json({
        success: true,
        message: "Topics are already in the same order!",
        topics: channel.topics,
        channelId: channelId,
      });
    }
    const topicMap = new Map(channel.topics.map(t => [t._id.toString(), t]));
    channel.topics = newOrder;
    await channel.save();
    const orderedTopics = newOrder.map(id => topicMap.get(id)).filter(Boolean);
    await RedisHelper.setChannelTopicsHash(channelId, orderedTopics);
    return res.json({
      success: true,
      message: "Updated topics successfully!",
      topics: orderedTopics,
      channelId: channelId,
    });
  } catch (err) {
    return res.json({
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
    const topic = await RedisHelper.getOrCacheTopic(topicId, `${CachePrefix.TOPIC_PREFIX}${topicId}`);
    if (!topic) {
      return res.json({
        success: false,
        message: "Topic not found.",
      });
    }
    const [user, channel, channelMembership, topicMembership] = await Promise.all([
      User.findById(user_id).select("email").lean(),
      RedisHelper.getOrCacheChannel(channelId, `${CachePrefix.CHANNEL_PREFIX}${channelId}`),
      RedisHelper.getChannelMembership(user_id, channelId),
      RedisHelper.getTopicMembership(user_id, topicId),
    ]);

    const isAlreadyIn = channelMembership?.status === "joined" && topicMembership?.status === "joined";
    if (isAlreadyIn) {
      return res.json({
        success: true,
        message: "You are already a member of this topic.",
        topic,
        topicMembership: topicMembership,
        channel: channel,
        channelMembership: channelMembership,
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
      invite.status === "expired" ||
      (invite.expire_time && invite.expire_time < new Date()) ||
      invite.usage_limit <= invite.used_by.length
    ) {
      return res.json({success: false,message: "Invalid or expired invite code."});
    }
    if (invite.used_by.includes(user_id)) {
      return res.json({success: false,message: "You have already used this invite code.",});
    }
    const inviterMembership = await RedisHelper.getTopicMembership(invite.user, topicId);
    if (!inviterMembership || !["owner", "admin"].includes(inviterMembership.role)) {
      return res.json({ success: false, message: "Invite code is not valid." });
    }
    invite.used_by.push(user_id);
    await invite.save();
    const cacheKeys=[];
    let channelNewMembership = channelMembership;
    let topicNewMembership = topicMembership;

    if (!channelMembership || channelMembership.status !== "joined") {
      const userCount = await RedisHelper.getUsersCount(channel.business, channelId);
      const plan = await RedisHelper.getBusinessPlan(channel.business);
      const userLimit = plan?.features?.userLimit || 30;

      if (userCount >= userLimit) {
        if (channel.business) {
          await emailRabbitmqService.sendNotificationMessage({
            type: "admin_notification",
            business: channel.business,
            buttonText: "",
            buttonLink: `/account/billing`,
            content: "You have reached the maximum number of users in your business. Upgrade your plan to add more.",
          });
        }
        return res.json({
          success: true,
          limitReached: true,
          joined: false,
          isBusiness: !!channel.business,
          message: "Channel room is full. Contact administrator for access.",
        });
      }
      let updatedChannelMembership = channelMembership;
      if (channelMembership?.status === "request") {
        channelMembership.status = "joined";
        await channelMembership.save();
        if (channel.business) {
          await RedisHelper.removeRequestFromBusinessArray(`${CachePrefix.CHANNEL_BUSINESS_REQUESTS_PREFIX}${channel.business}`, channelMembership._id);
        }
        cacheKeys.push(`${CachePrefix.CHANNEL_MEMBERSHIP_USER_PREFIX}${channelId}:${user_id}`);
        updatedChannelMembership = channelMembership;
      } else if (!channelMembership) {
        updatedChannelMembership = await ChannelMembership.create({
          channel: channelId,
          user: user_id,
          business: topic.business,
          email: user.email,
          status: "joined",
        });
      }
      channelNewMembership = updatedChannelMembership.toObject();
      await updatedChannelMembership.populate([
        { path: "user", select: "_id name username logo color_logo email" },
        { path: "channel", select: "_id name logo" },
      ]);
      await RedisHelper.addUserToChannel(channelId, updatedChannelMembership);
      if (channel.business) {
        await RedisHelper.addUserToBusiness(channel.business, user_id);
      }
    }
    let finalTopicMembership = topicMembership;
    if (topicMembership?.status === "request") {
      topicMembership.status = "joined";
      await topicMembership.save();
      cacheKeys.push(`${CachePrefix.TOPIC_MEMBERSHIP_USER_PREFIX}${topicId}:${user_id}`);
      finalTopicMembership = topicMembership;
      topicNewMembership = topicMembership;
      if (topic.business) {
        await RedisHelper.removeRequestFromBusinessArray(`${CachePrefix.TOPIC_BUSINESS_REQUESTS_PREFIX}${topic.business}`, topicMembership._id);
      }
    }

    if (!finalTopicMembership || finalTopicMembership.status !== "joined") {
      const newMembership = await TopicMembership.create({
        topic: topicId,
        user: user_id,
        email: user.email,
        business: topic.business,
        channel: channelId,
        status: "joined",
      });
      topicNewMembership = newMembership.toObject();
      await newMembership.populate([
        { path: "user", select: "_id name username logo color_logo email" },
        { path: "topic", select: "_id name" },
      ]);
      await RedisHelper.addUserToTopic(topicId, newMembership);
      finalTopicMembership = newMembership;
    }
    await rabbitmqService.publishInvalidation(cacheKeys, "topic");

    return res.json({
      success: true,
      message: "Topic joined successfully.",
      topic,
      topicMembership: topicNewMembership,
      channel: channel,
      channelMembership: channelNewMembership,
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
    const [ownership,topic] = await Promise.all([
      RedisHelper.getTopicMembership(user_id, topicId),
      RedisHelper.getOrCacheTopic(topicId, `${CachePrefix.TOPIC_PREFIX}${topicId}`),
    ]);
    if(!ownership || (ownership.role !== "owner" && ownership.role !== "admin")){
      return res.json({
        success: false,
        message: "You are not authorized to update roles.",
      });
    }
    if(!topic){
      return res.json({
        success: false,
        message: "Topic not found.",
      });
    }
    const membership = await TopicMembership.findOneAndUpdate(
      { topic: topicId, user: userId, status: "request" },
      { status: "joined" , business: topic.business || null},
      { new: true }
    );
    if(!membership){
      return res.json({
        success: false,
        message: "No pending request found for this user in the topic.",
      });
    }
    await RedisHelper.removeUserFromTopicRequest(topicId, userId);
    if(topic.business){
      await RedisHelper.removeRequestFromBusinessArray(`${CachePrefix.TOPIC_BUSINESS_REQUESTS_PREFIX}${topic.business}`, membership._id);
    }
    await membership.populate([
      { path: "user", select: "_id name username logo color_logo email" },
      { path: "topic", select: "_id name" },
    ]);
    await RedisHelper.addUserToTopic(topicId, membership);
    await rabbitmqService.publishInvalidation(
      [`${CachePrefix.TOPIC_MEMBERSHIP_USER_PREFIX}${topicId}:${user_id}`],
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
    const [ownership,topic] = await Promise.all([
      RedisHelper.getTopicMembership(user_id, topicId),
      RedisHelper.getOrCacheTopic(topicId, `${CachePrefix.TOPIC_PREFIX}${topicId}`),
    ]);
    if(!ownership || (ownership.role !== "owner" && ownership.role !== "admin")){
      return res.json({
        success: false,
        message: "You are not authorized to update roles.",
      });
    }
    const existingRequest = await TopicMembership.findOne({
      topic: topicId,
      user: userId,
      status: "request",
    });
    if (existingRequest) {
      await RedisHelper.removeUserFromTopicRequest(topicId, userId);
      if(topic.business){
        await RedisHelper.removeRequestFromBusinessArray(`${CachePrefix.TOPIC_BUSINESS_REQUESTS_PREFIX}${topic.business}`, existingRequest._id);
      }
      await existingRequest.deleteOne();
    }
    if(topic.business){
      await RedisHelper.removeRequestFromBusinessArray(`${CachePrefix.TOPIC_BUSINESS_REQUESTS_PREFIX}${topic.business}`, existingRequest._id);
    }
    await rabbitmqService.publishInvalidation(
      [`${CachePrefix.TOPIC_MEMBERSHIP_USER_PREFIX}${topicId}:${user_id}`],
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
