require("dotenv").config();
const sharp = require("sharp");
const path = require("path");
var mongoose = require("mongoose");
var Topic = mongoose.model("Topic");
var Chip = mongoose.model("Chip");
var Channel = mongoose.model("Channel");
var ChannelChat = mongoose.model("ChannelChat");
var ChannelMembership = mongoose.model("ChannelMembership");
var TopicMembership = mongoose.model("TopicMembership");
var Summary = mongoose.model("Summary");
var User = mongoose.model("User");
var Invite = mongoose.model("Invite");
var Event = mongoose.model("Event");
var Poll = mongoose.model("Poll");
const sendChannelRequest = require("../../coms/channelRequest/sendChannelRequest");
const sendAcceptChannelRequest = require("../../coms/acceptChannel/sendAcceptChannelRequest");
const chatRabbitmqService = require("../services/chatRabbitmqService");
const rabbitmqService = require("../services/rabbitmqService");
const emailRabbitmqService = require("../services/emailRabbitmqService");
const linkUserMemberships = require("../../utils/linkMembership");
const redisService = require("../services/redisService");
const { CachePrefix } = require("../../utils/prefix");
const redisClient = require("../../utils/redisClient");
const RedisHelper = require("../../utils/redisHelpers");

const {
  uploadSingleImageLogo,
  uploadSingleImage,
} = require("../aws/uploads/Images");

exports.check_channel_name = async function (req, res) {
  const { name } = req.body;
  const user_id = res.locals.verified_user_id;
  try {
    const channel = await Channel.findOne({ name: name, user: user_id }).lean();
    if (!channel) {
      return res.json({ success: true, message: "Available" });
    }
    res.json({ success: false, message: "Not Available" });
  } catch (error) {
    console.error("Failed to search channel:", error);
    res.json({ success: false, message: "Failed to search channel" });
  }
};

exports.create_channel = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const {
    name,
    description,
    visibility,
    logo,
    cover_image,
    imageSource,
    paywallPrice,
  } = req.body;

  if (!user_id) {
    return res.json({
      success: false,
      message: "User id is required.",
    });
  }

  const user = await User.findById(user_id);
  if(!user){
    return res.json({
      success: false,
      message: "User not found.",
    });
  }
  let channelsCount = await RedisHelper.getChannelsCount(user.business,user_id);
  let myPlan = await RedisHelper.getBusinessPlan(user.business);
  if((!myPlan && channelsCount >= 1) || (myPlan && myPlan.features.maxChannels<=channelsCount)){
    if(user.business){
    await emailRabbitmqService.sendNotificationMessage({
      type: "admin_notification",
      business: user.business,
      buttonText: "",
      buttonLink: `/account/billing`,
      content: "You have reached the maximum number of channels. Upgrade your plan to add more.",
    });
  }
    return res.json({
      success: true,
      isBusiness: user.business?true:false,
      limitReached: true,
      username:user.username,
      message: "You have reached the maximum number of channels for your plan. Upgrade your plan to create more channels.",
    });
  }
  const business_id = user.business;
  let logoUrl = logo || null;
  if (req.files["logo"]) {
    const imageFile = req.files["logo"][0];
    logoUrl = await uploadSingleImageLogo(imageFile.buffer, "channelLogo");
  }

  let coverUrl = null;
  if (imageSource === "upload" && req.files["cover_image"]) {
    const imageFile2 = req.files["cover_image"][0];
    coverUrl = await uploadSingleImage(imageFile2.buffer, "channelCover");
  } else if (imageSource === "unsplash") {
    coverUrl = cover_image;
  }

  try {
    const channel_data = {
      user: user_id,
      name: name,
      logo: logoUrl,
      cover_image: coverUrl,
      description: description,
      visibility: visibility,
      business: business_id,
      paywallPrice: paywallPrice,
    };

    let channel = await Channel.create(channel_data);
    const myMembership = await ChannelMembership.create({
      channel: channel._id,
      user: user_id,
      role: "owner",
      email: user.email,
      status: "joined",
      business: user.business,
    });
    await channel.populate([
      { path: "user", select: "name username _id logo color_logo" },
    ]);
    const createdChannelsCacheKey = `${CachePrefix.CHANNELS_CREATED_PREFIX}${user_id}`;
    await RedisHelper.incrementChannelsCount(user.business);
    const myMembershipCacheKey = `${CachePrefix.CHANNEL_MEMBERSHIP_USER_PREFIX}${channel._id}:${user_id}`;
    await redisService.setCache(myMembershipCacheKey, myMembership, 36000);

    await rabbitmqService.publishInvalidation(
      [createdChannelsCacheKey],
      "channel"
    );

    return res.json({
      success: true,
      message: "Channel created",
      channel: {
        ...channel.toObject(),
        members: [myMembership] || [],
      },
    });
  } catch (error) {
    res.json({ success: false, error: "Channel can't be created." });
  }
};

exports.update_channel = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const {
    _id,
    name,
    description,
    visibility,
    logo,
    cover_image,
    imageSource,
    paywallPrice,
  } = req.body;

  if (!user_id) {
    return res.json({
      success: false,
      message: "User id is required.",
    });
  }
  const [ownership,existingChannel] = await Promise.all([
    RedisHelper.getChannelMembership(user_id,_id),
    Channel.findById(_id).select("user logo cover_image").lean()
  ]);

  if(!ownership || (ownership.role !== "owner" && ownership.role !== "admin")){
    return res.json({
      success: false,
      message: "You do not have permission to edit this channel.",
    });
  }
  const business_id = ownership.business;
  const channelCacheKey = `${CachePrefix.CHANNEL_PREFIX}${_id}`;
  const createdChannelsCacheKey = `${CachePrefix.CHANNELS_CREATED_PREFIX}${user_id}`;

  let logoUrl = existingChannel.logo;
  let coverUrl = existingChannel.cover_image;
  if (req.files && req.files["logo"]) {
    logoUrl = await uploadSingleImageLogo(
      req.files["logo"][0].buffer,
      "channelLogo"
    );
  } else if (logo === null || logo === "") {
    logoUrl = null;
  }

  if (imageSource === "upload" && req.files && req.files["cover_image"]) {
    coverUrl = await uploadSingleImage(
      req.files.cover_image[0].buffer,
      "channelCover"
    );
  } else if (imageSource === "unsplash" && cover_image) {
    coverUrl = cover_image;
  } else if (cover_image === null || cover_image === "") {
    coverUrl = null;
  }

  try {
    const updateData = {
      ...(name && { name }),
      ...(description && { description }),
      ...(visibility && { visibility }),
      logo: logoUrl,
      business: business_id,
      cover_image: coverUrl,
      paywallPrice: paywallPrice,
    };

    const updatedChannel = await Channel.findByIdAndUpdate(_id, updateData, {
      new: true,
    });
    await updatedChannel.populate([
      { path: "user", select: "name username _id logo color_logo" },
      { path: "topics", select: "name _id editability visibility" },
    ]);

    await rabbitmqService.publishInvalidation(
      [createdChannelsCacheKey, channelCacheKey],
      "channel"
    );
    return res.json({
      success: true,
      message: "Channel updated successfully.",
      channel: {
        ...updatedChannel.toObject(),
        members: [ownership] || [],
      },
    });
  } catch (error) {
    console.error("Error updating channel:", error);
    res
      .status(500)
      .json({ success: false, error: "Channel can't be updated." });
  }
};

exports.fetch_channel_members = async function (req, res, next) {
  const { channelId } = req.body;
  const user_id = res.locals.verified_user_id;
  if (!channelId || !mongoose.Types.ObjectId.isValid(channelId) || !user_id) {
    return res.json({
      success: false,
      message: "Invalid or missing channelId",
    });
  }
  try {
    const ownership = await RedisHelper.getChannelMembership(user_id, channelId);
    if(!ownership || (ownership.role !== "owner" && ownership.role !== "admin")){
      return res.json({
        success: false,
        message: "You do not have permission to view this channel.",
      });
    }
    const cachedMembers = await RedisHelper.getChannelMembers(channelId);
    if (cachedMembers.length>0) {
      return res.json({
        success: true,
        message: "Members fetched successfully from cache",
        members: cachedMembers || [],
      });
    }
    const channelMembers = await ChannelMembership.find({
      channel: channelId,
      user: { $ne: null },
      status: "joined",
      role: { $ne: "owner" },
    })
      .populate({ path: "user", select: "name username _id logo color_logo" })
      .lean();
      await RedisHelper.setChannelMembersHash(channelId, channelMembers);

    res.json({
      success: true,
      message: "Members fetched successfully",
      members: channelMembers || [],
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




exports.removeChannelCover = async function (req, res) {
  const { channelId } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    const channel = await Channel.findById(channelId);
    if (!channel || channel.user.toString() !== user_id) {
      return res.json({
        success: false,
        message: "Channel not found or user is unauthorized.",
      });
    }
    channel.cover_image = "";
    await channel.save();
    const channelCacheKey = `${CachePrefix.CHANNEL_PREFIX}${channelId}`;
    await rabbitmqService.publishInvalidation([channelCacheKey], "channel");
    return res.json({
      success: true,
      message: "Cover image removed successfully",
      channel: channel,
    });
  } catch (error) {
    console.error("Error in removing cover image:", error);
    res.json({ success: false, message: "Error in removing cover image." });
  }
};

exports.saveChannelCover = async function (req, res) {
  const { channel } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    const channelExist = await Channel.findById(channel);
    if (!channelExist || channelExist.user.toString() !== user_id) {
      return res.json({
        success: false,
        message: "Channel not found or user is unauthorized.",
      });
    }
    let cover_image = channelExist.cover_image || null;
    if (req.file) {
      cover_image = await uploadSingleImage(req.file.buffer, "channelCover");
    }
    channelExist.cover_image = cover_image;
    await channelExist.save();
    if (req.file) {
      const channelCacheKey = `${CachePrefix.CHANNEL_PREFIX}${channel}`;
      await rabbitmqService.publishInvalidation([channelCacheKey], "channel");
    }

    return res.json({
      success: true,
      message: "Cover image updated successfully",
      channel: channelExist,
    });
  } catch (error) {
    console.error("Error in changing cover image:", error);
    res.json({ success: false, message: "Error in changing cover image." });
  }
};

exports.fetch_community_channel = async function (req, res) {
  const channelId = "678798aef9e3a667d5a5d1ea";

  try {
    const channel = await Channel.findById(channelId)
      .populate([
        { path: "topics", select: "name _id editability visibility" },
        { path: "user", select: "name username _id" },
      ])
      .lean();
    if (!channel) {
      return res.json({ success: false, message: "Channel not found" });
    }
    let channelMembers = [];
    const cachedMembers = await RedisHelper.getChannelMembers(channelId);
    if (cachedMembers.length > 0) {
      channelMembers = cachedMembers;
    } else {
      channelMembers = await ChannelMembership.find({
        channel: channelId,
        user: { $ne: null },
        role: { $ne: "owner" },
      })
        .populate({ path: "user", select: "name username _id logo color_logo" })
        .lean();
      await RedisHelper.setChannelMembersHash(channelId, channelMembers);
    }
    return res.json({
      success: true,
      message: "Channel fetched successfully",
      channel: {
        ...channel,
        members: channelMembers || [],
      },
    });
  } catch (error) {
    console.error("Error in fetching channel:", error);
    res.json({ success: false, message: "Error in fetching channel." });
  }
};


async function getCreatedChannels(userId, cacheKey) {
  let createdChannels = await redisService.getCache(cacheKey);
  if (!createdChannels) {
    createdChannels = await Channel.find({ user: userId })
      .populate([
        { path: "topics", select: "name _id editability visibility" },
        { path: "user", select: "name username _id logo color_logo" },
      ])
      .lean();
    await redisService.setCache(cacheKey, createdChannels, 7200);
  }
  return createdChannels;
}

async function getJoinedChannels(channelIds, topicMap, membershipMap) {
  const joinedChannelsRaw = await Channel.find({ _id: { $in: channelIds } })
    .populate([
      { path: "topics", select: "name _id editability visibility" },
      { path: "user", select: "name username _id logo color_logo" },
    ])
    .lean();

    return joinedChannelsRaw.map((channel) => {
      const chId = channel._id.toString();
      const allowedTopicIds = topicMap[chId] || new Set();

      const filteredTopics = (channel.topics || []).filter(t =>
        allowedTopicIds.has(t._id.toString())
      );

    return {
      ...channel,
      topics: filteredTopics,
      membership: membershipMap[chId] || null,
    };
  });
}



async function getMembershipMaps(channelMemberships, topicMemberships) {
  const membershipMap = Object.fromEntries(
    channelMemberships.map((m) => [m.channel.toString(), m])
  );
  const topicMap = topicMemberships.reduce((acc, { topic, channel }) => {
    const chId = channel.toString();
    if (!acc[chId]) acc[chId] = new Set();
    acc[chId].add(topic.toString());
    return acc;
  }, {});

  return { membershipMap, topicMap };
}



exports.fetch_my_channels = async function (req, res, next) {
  const user_id = res.locals.verified_user_id;

  if (!user_id) {
    return res.status(401).json({
      success: false,
      message: "User not found",
    });
  }
  try {
    // const createdChannelsCacheKey = `${CachePrefix.CHANNELS_CREATED_PREFIX}${user_id}`;
    const [channelMemberships, topicMemberships] = await Promise.all([
      ChannelMembership.find({ user: user_id, status: 'joined' }).lean(),
      TopicMembership.find({user: user_id,status: "joined"}).lean(),
    ]);

    const channelIds = channelMemberships.map((entry) =>
      entry.channel.toString()
    );
    const { membershipMap, topicMap } = await getMembershipMaps(channelMemberships, topicMemberships);
    const joinedChannels = await getJoinedChannels(channelIds, topicMap, membershipMap);
    return res.json({
      success: true,
      message: "Channels fetched successfully",
      channels: joinedChannels,
    });
  } catch (error) {
    console.error("Error in fetching channels:", error);
    res.status(500).json({
      success: false,
      message: "Error in fetching channels",
      error: error.message,
    });
  }
};

exports.fetch_channels = async function (req, res, next) {
  const { username, user_id } = req.body;

  try {
    if (!username) {
      return res.json({
        success: false,
        message: "Username is required",
      });
    }
    const user = await User.findOne({ username }).lean();
    if (!user) {
      return res.json({
        success: false,
        message: "Owner user not found",
      });
    }

    const cacheKey = `${CachePrefix.CHANNELS_CREATED_PREFIX}${user._id}`;
    const channels = await getCreatedChannels(user._id, cacheKey);

    let membershipMap = new Map();

    if (user_id && mongoose.Types.ObjectId.isValid(user_id)) {
      const channelIds = channels.map((ch) => ch._id);
      const memberships = await ChannelMembership.find({
        channel: { $in: channelIds },
        user: user_id,
      }).lean();
      membershipMap = new Map(
        memberships.map((m) => [m.channel.toString(), m])
      );
    }

    const enrichedChannels = channels.map((channel) => {
      const chId = channel._id.toString();
      return {
        ...channel,
        members: membershipMap.get(chId) ? [membershipMap.get(chId)] : [],
      };
    });

    return res.json({
      success: true,
      message: "Channels fetched successfully",
      channels: enrichedChannels,
    });
  } catch (error) {
    console.error("Error in fetching channels:", error);
    return res.status(500).json({
      success: false,
      message: "Error in fetching channels",
      error: error.message,
    });
  }
};

exports.fetch_channel = async function (req, res, next) {
  const { id, user_id } = req.body;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.json({
      success: false,
      message: "Invalid Channel ID",
    });
  }

  try {
    const cacheKey = `${CachePrefix.CHANNEL_PREFIX}${id}`;
    // await rabbitmqService.publishInvalidation([`${CachePrefix.CHANNEL_MEMBERSHIP_USER_PREFIX}${id}:${user_id}`], "channel");

    const cachedChannel = await RedisHelper.getOrCacheChannel(id, cacheKey);
    if (!cachedChannel) {
      return res.json({
        success: false,
        message: "No Channel found",
      });
    }
    const [cachedMembers, myMembership] =
      await Promise.all([
        RedisHelper.getChannelMembers(id),
        // null,
        RedisHelper.getChannelMembership(user_id, id),
      ]);

      let memberCount = cachedMembers;
      if (memberCount.length === 0) {
        const memberships = await ChannelMembership.find({ channel: id, status: "joined" })
          .populate([
            { path: "user", select: "_id name username logo color_logo email" },
            { path: "channel", select: "_id name logo" },
          ])
          .lean();
        memberCount = memberships.length;
        await RedisHelper.setChannelMembersHash(id, memberships);
      } else {
        memberCount = cachedMembers.length;
      }

    return res.json({
      success: true,
      message: "Channel fetched successfully",
      channel: {
        ...cachedChannel,
        members:myMembership?[myMembership]:[],
        memberCount: memberCount || 0,
      },
    });
  } catch (error) {
    console.error("Error in fetching channel", error);
    res.status(500).json({
      success: false,
      message: "Error in fetching channel",
      error: error.message,
    });
  }
};

exports.delete_channel = async function (req, res, next) {
  const { id } = req.body;
  const user_id = res.locals.verified_user_id;

  if (!id || !mongoose.Types.ObjectId.isValid(id) || !user_id) {
    return res.status(400).json({
      success: false,
      message: "Invalid Channel or User ID",
    });
  }

  try {
    const channel = await Channel.findById(id).select("_id user topics business").lean();
    if (!channel || channel.user.toString() !== user_id.toString()) {
      return res.json({
        success: false,
        message: "Channel not found or you are not the owner",
      });
    }
    const allTopics = channel.topics;
    await Promise.all([
      Channel.findByIdAndDelete(id),
      Topic.deleteMany({ channel: id }),
      ChannelMembership.deleteMany({ channel: id }),
      TopicMembership.deleteMany({ channel: id }),
      ChannelChat.deleteMany({ channel: id }),
      Event.deleteMany({ topic: { $in: allTopics } }),
      Poll.deleteMany({ topic: { $in: allTopics } }),
      Summary.deleteMany({ topic: { $in: allTopics } }),
    ]);
    const cacheKeys = [
      `${CachePrefix.CHANNEL_PREFIX}${id}`,
      `${CachePrefix.CHANNELS_CREATED_PREFIX}${user_id}`,
      `${CachePrefix.CHANNELS_MEMBERS_PREFIX}${id}`,
      `${CachePrefix.CHANNEL_REQUESTS_PREFIX}${id}`,
      `${CachePrefix.TOPICS_ALL_CHANNEL_PREFIX}${id}`,
      `${CachePrefix.CHANNELS_MEMBERS_COUNT_PREFIX}${id}`,
      `${CachePrefix.TOPICS_CHANNEL_COUNT_PREFIX}${id}`,
      ...allTopics.map(tid => `${CachePrefix.TOPIC_PREFIX}${tid}`),
      ...allTopics.map(tid => `${CachePrefix.TOPICS_MEMBERS_PREFIX}${tid}`),
      ...allTopics.map(tid => `${CachePrefix.TOPIC_REQUESTS_PREFIX}${tid}`),
    ];
    const topicMemberPatterns = allTopics.map(
      tid => `${CachePrefix.TOPIC_MEMBERSHIP_USER_PREFIX}${tid}:*`
    );
    const channelMemberPattern = `${CachePrefix.CHANNEL_MEMBERSHIP_USER_PREFIX}${id}:*`;
    if (channel.business) {
      await RedisHelper.decrementChannelsCount(channel.business);
      cacheKeys.push(
        `${CachePrefix.BUSINESS_USERS_COUNT_PREFIX}${channel.business}`,
        `${CachePrefix.CHANNEL_BUSINESS_REQUESTS_PREFIX}${channel.business}`,
        `${CachePrefix.TOPIC_BUSINESS_REQUESTS_PREFIX}${channel.business}`,
        `${CachePrefix.EVENT_BUSINESS_REQUESTS_PREFIX}${channel.business}`
      );
    }
    await rabbitmqService.publishInvalidation(cacheKeys, "channel");
    await chatRabbitmqService.publishInvalidation(
      [channelMemberPattern, ...topicMemberPatterns],
      "channel",
      "cache.delete.channel"
    );
    return res.json({
      success: true,
      message: "Channel deleted successfully",
      channelId: id,
    });
  } catch (error) {
    console.error("Error in deleting channel", error);
    return res.json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.join_channel = async function (req, res, next) {
  const user_id = res.locals.verified_user_id;
  const { channelId } = req.body;
  try {
    const cacheKey = `${CachePrefix.CHANNEL_PREFIX}${channelId}`;
    const channel = await RedisHelper.getOrCacheChannel(channelId, cacheKey);
    if (!channel) {
      return res.json({ success: false, message: "Channel not found." });
    }
    const [user,existing] = await Promise.all([
      User.findById(user_id).select("email").lean(),
      RedisHelper.getChannelMembership(user_id, channelId),
    ]);
    if (existing) {
      if (existing.status === "joined") {
        const allTopicsJoined = await TopicMembership.find({
          channel: channelId,
          user: user_id,
          status: "joined",
        })
          .select("topic")
          .lean();

        return res.json({
          success: true,
          message: "You are already a member of this channel",
          topics: allTopicsJoined.map((t) => t.topic),
          channel,
          membership: existing,
          joined: true,
          joinStatus: "already",
        });
      }
      return res.json({
        success: false,
        message: "Request already sent. Please wait for approval.",
        joined: false,
      });
    }
    if(channel.visibility === "anyone" || (channel.visibility === "paid" && channel.paywallPrice > 0)){
      let usersCount = await RedisHelper.getUsersCount(channel.business,channelId);
      let myPlan = await RedisHelper.getBusinessPlan(channel.business);
      if((!myPlan && usersCount >= 30) || (myPlan && myPlan.features.userLimit<=usersCount)){
        if(channel.business){
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
          joined:false,
          isBusiness: channel.business?true:false,
          message:"Channel room is full. Contact administrator for access.",
        });
      }
    }
    if (channel.visibility === "paid" && channel.paywallPrice > 0) {
      return res.json({
        success: true,
        message:
          "This channel is paywalled. Please purchase the channel to join.",
        paywall: true,
        paywallPrice: channel.paywallPrice,
        channel: channel,
        membership: null,
        joined: false,
      });
    }
    if (channel.visibility === "anyone") {
      const membership = await ChannelMembership.create({
        channel: channelId,
        user: user_id,
        email: user.email,
        business: channel.business || null,
        status: "joined",
      });
      if(channel.business){
        await RedisHelper.addUserToBusiness(channel.business, user_id);
      }

      const publicTopics = channel.topics.filter(
        (t) => t.visibility === "anyone"
      );
      const topicIds = publicTopics.map((t) => t._id);
      let topicMemberships = [];
      if (topicIds.length) {
        const bulkOps = topicIds.map((topicId) => {
          const membershipDoc = {
            topic: topicId,
            user: user_id,
            channel: channel._id,
            business: channel.business || null,
            email: user.email,
            status: "joined",
          };
          topicMemberships.push(membershipDoc);
          return { insertOne: { document: membershipDoc } };
        });

        await TopicMembership.bulkWrite(bulkOps);
        // const topicCacheKeys = topicIds.map(
        //   (id) => `${CachePrefix.TOPICS_MEMBERS_PREFIX}${id}`
        // );
        await emailRabbitmqService.sendTopicMembershipRedisSyncJob({
          topicIds,
          userId: user_id,
        });
        // await rabbitmqService.publishInvalidation(
        //   [
        //     ...topicCacheKeys,
        //   ],
        //   "channel"
        // );
      }
      const request_membership  = membership.toObject();
        await membership.populate([
          { path: "user", select: "_id name username logo color_logo email" },
          { path: "channel", select: "_id name logo" },
        ]);
        await RedisHelper.addUserToChannel(channelId,membership);
      return res.json({
        success: true,
        message: "Channel joined successfully.",
        channel: {
          ...channel,
          topics: publicTopics,
        },  
        topics: topicIds,
        membership: request_membership,
        joined: true,
        joinStatus: "first",
      });
    }

    if (channel.visibility === "invite") {
      const membership = await ChannelMembership.create({
        channel: channelId,
        user: user_id,
        email: user.email,
        business: channel.business,
        status: "request",
      });
      const request_membership  = membership.toObject();
      await membership.populate([
        { path: "user", select: "_id name username logo color_logo email" },
        { path: "channel", select: "_id name logo" },
      ]);
      await RedisHelper.addUserToChannelRequest(channelId,membership);
      if(channel.business){
        await RedisHelper.appendRequestToBusinessArray(`${CachePrefix.CHANNEL_BUSINESS_REQUESTS_PREFIX}${channel.business}`, membership,3600);
      }
      return res.json({
        success: true,
        message: "Request sent successfully. Please wait for approval.",
        channel,
        membership: request_membership,
        joined: false,
        joinStatus: "request",
      });
    }

    return res.json({
      success: false,
      message: "Can't join private channel. Contact administrator for access",
    });
  } catch (error) {
    console.error("Error in joining channel:", error);
    return res.json({
      success: false,
      message: "Error in joining channel.",
      error: error.message,
    });
  }
};

exports.leave_channel = async function (req, res, next) {
  const user_id = res.locals.verified_user_id;
  const { channelId } = req.body;
  if (!user_id || !channelId) {
    return res.json({
      success: false,
      message: "Invalid channelId or userId.",
    });
  }
  try {
    const channelCacheKey = `${CachePrefix.CHANNEL_PREFIX}${channelId}`;
    const channel = await RedisHelper.getOrCacheChannel(channelId, channelCacheKey);
    if (!channel) {
      return res.json({
        success: false,
        message: "No channel found.",
      });
    }
    const topicIds = channel.topics.map((t) => t._id) || [];
    const topicMemberships = await TopicMembership.find({
      channel: channelId,
      user: user_id,
    }).lean();
    
    const [membership, _,user] = await Promise.all([
      ChannelMembership.findOneAndDelete({ channel: channelId, user: user_id }),
      TopicMembership.deleteMany({ channel: channelId, user: user_id }),
      User.findById(user_id).select("username").lean(),
    ]);
    if (channel.business && (membership.role==="admin" || membership.role==="owner")) {
      await emailRabbitmqService.sendNotificationMessage({
        type: "admin_notification",
        business: channel.business,
        buttonText: "",
        buttonLink: `/account/billing`,
        content: `Admin (${user.username}) of ${channel.name} has left the channel.`, 
      });
    }
    const topicMemberCacheKeys = topicIds.map(
      (topicId) => `${CachePrefix.TOPICS_MEMBERS_PREFIX}${topicId}`
    );
    const topicMemberCacheUserKeys = topicIds.map(
      (topicId) => `${CachePrefix.TOPIC_MEMBERSHIP_USER_PREFIX}${topicId}:${user_id}`
    );
    await RedisHelper.removeUserFromChannel(channelId,user_id);
    const cacheKeys = [
      `${CachePrefix.CHANNEL_MEMBERSHIP_USER_PREFIX}${channelId}:${user_id}`,
      ...topicMemberCacheKeys,
      ...topicMemberCacheUserKeys,
    ];
    if(channel.business){
      await RedisHelper.removeUserFromBusiness(channel.business, user_id);
    }
    await rabbitmqService.publishInvalidation(cacheKeys, "channel");
    return res.json({
      success: true,
      channel: channel,
      membership: membership,
      topics: topicMemberships,
      message: "Channel left successfully",
    });
  } catch (error) {
    console.error("Error in leaving channel:", error);
    return res.json({
      success: false,
      message: "Error in leaving channel.",
      error: error.message,
    });
  }
};

exports.fetch_channel_requests = async function (req, res, next) {
  const { channelId } = req.body;
  const user_id = res.locals.verified_user_id;
  if (!channelId || !mongoose.Types.ObjectId.isValid(channelId) || !user_id) {
    return res.json({
      success: false,
      message: "Invalid or missing channelId",
    });
  }
  try {
    const ownership = await RedisHelper.getChannelMembership(user_id, channelId);
    if(!ownership || (ownership.role !== "owner" && ownership.role !== "admin")){
      return res.json({
        success: false,
        message: "You do not have permission to view this channel.",
      });
    }
    const cachedRequests = await RedisHelper.getChannelRequests(channelId);
    if (cachedRequests.length>0) {
      return res.json({
        success: true,
        message: "Requests fetched successfully from cache",
        requests: cachedRequests || [],
      });
    }
    
    const channelRequests = await ChannelMembership.find({
      channel: channelId,
      user: { $ne: null },
      status: "request", 
      role: { $nin: ["owner","admin"] },
    })
      .populate([{ path: "user", select: "name username _id logo color_logo" },{path: "channel", select: "name _id"}])
      .lean();
    await RedisHelper.setChannelRequestsHash(channelId, channelRequests);
    res.json({
      success: true,
      message: "Requests fetched successfully",
      requests: channelRequests || [],
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

exports.accept_channel_request = async function (req, res, next) {
  const { channelId, userId, email } = req.body;
  const user_id = res.locals.verified_user_id;
  try {
    const [ownership,channel] = await Promise.all([
      RedisHelper.getChannelMembership(user_id, channelId),
      RedisHelper.getOrCacheChannel(channelId, `${CachePrefix.CHANNEL_PREFIX}${channelId}`),
    ]);
    if (!ownership || (ownership.role !== "owner" && ownership.role !== "admin")) {
      return res.json({
        success: false,
        message: "You are not authorized to update roles.",
      });
    }
    if(!channel){
      return res.json({
        success: false,
        message: "Channel not found.",
      });
    }
    let usersCount = await RedisHelper.getUsersCount(channel.business,channelId);
    let myPlan = await RedisHelper.getBusinessPlan(channel.business);
    if((!myPlan && usersCount >= 30) || (myPlan && myPlan.features.userLimit<=usersCount)){
      if(channel.business){
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
        isBusiness: channel.business?true:false,
        message:"You have reached the maximum number of users in your business. Upgrade your plan to add more.",
      });
    }
    const membership = await ChannelMembership.findOneAndUpdate(
      { channel: channelId, user: userId, status: "request" },
      { status: "joined", business: channel.business || null },
      { new: true }
    );

    if (!membership) {
      return res.json({
        success: false,
        message: "No pending request found for this user in the channel.",
      });
    }
    await RedisHelper.removeUserFromChannelRequest(channelId,userId);
    
    if(channel.business){
      await RedisHelper.removeRequestFromBusinessArray(`${CachePrefix.CHANNEL_BUSINESS_REQUESTS_PREFIX}${channel.business}`, membership._id);
      await RedisHelper.addUserToBusiness(channel.business, userId);
    }
    await membership.populate([
      { path: "user", select: "_id name username logo color_logo email" },
      { path: "channel", select: "_id name logo" },
    ]);
    await RedisHelper.addUserToChannel(channelId,membership);
    await rabbitmqService.publishInvalidation(
      [
        `${CachePrefix.CHANNEL_MEMBERSHIP_USER_PREFIX}${channelId}:${userId}`,
      ],
      "channel"
    );
    if (email && email !== "") {
      await emailRabbitmqService.sendEmailMessage({
        to: email,
        channelId: channelId,
        channelName: channel.name,
        username: channel.user.username,
        logo:
          channel.logo ||
          "https://d3i6prk51rh5v9.cloudfront.net/channel_cover.png",
        topicId: "",
        topicName: "",
        eventId: "",
        eventName: "",
      });
    }
    return res.json({
      success: true,
      message: "Channel joined successfully.",
      channelId: channelId,
      userId: userId,
      membership:membership
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

exports.decline_channel_request = async function (req, res, next) {
  const { channelId, userId } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    const [ownership,channel] = await Promise.all([
      RedisHelper.getChannelMembership(user_id, channelId),
      RedisHelper.getOrCacheChannel(channelId, `${CachePrefix.CHANNEL_PREFIX}${channelId}`),
    ]);
    if (!ownership || (ownership.role !== "owner" && ownership.role !== "admin")) {
      return res.json({
        success: false,
        message: "You are not authorized to update roles.",
      });
    }
    const existingRequest = await ChannelMembership.findOne({
      channel: channelId,
      user: userId,
      status: "request",
    });
    if (existingRequest) {
      await existingRequest.deleteOne();
      await RedisHelper.removeUserFromChannelRequest(channelId,userId);
    }
    if(channel.business){
      await RedisHelper.removeRequestFromBusinessArray(`${CachePrefix.CHANNEL_BUSINESS_REQUESTS_PREFIX}${channel.business}`, existingRequest._id);
    }
    await rabbitmqService.publishInvalidation(
      [`${CachePrefix.CHANNEL_MEMBERSHIP_USER_PREFIX}${channelId}:${user_id}`,],
      "channel"
    );
    return res.json({
      success: true,
      message: "Channel request declined successfully.",
      channelId: channelId,
      userId: userId,
    });
  } catch (error) {
    console.error("Error in declining channel request:", error);
    return res.status(500).json({
      success: false,
      message: "Error in declining channel request.",
      error: error.message,
    });
  }
};

exports.remove_channel_member = async function (req, res, next) {
  const user_id = res.locals.verified_user_id;
  const { channelId, userId } = req.body;
  if (!channelId || !userId) {
    return res.json({
      success: false,
      message: "Invalid Channel ID or User ID",
    });
  }
  try {
    const ownership = await RedisHelper.getChannelMembership(user_id, channelId);
    if (!ownership || (ownership.role !== "owner" && ownership.role !== "admin")) {
      return res.json({
        success: false,
        message: "You are not authorized to update roles.",
      });
    }
    const [existingMember, affectedTopicMemberships,_] = await Promise.all([
      ChannelMembership.findOneAndDelete({
        channel: channelId,
        user: userId,
        status: "joined",
      }),
      TopicMembership.find({
        channel: channelId,
        user: userId,
        status: "joined",
      }).lean(),
      TopicMembership.deleteMany({
        channel: channelId,
        user: userId,
        status: "joined",
      })
    ]);
    const topicIds = affectedTopicMemberships.map(tm => tm.topic);
    await RedisHelper.removeUserFromMultipleTopics(topicIds, userId);
    if(ownership.business){
      await RedisHelper.removeUserFromBusiness(ownership.business, userId);
    }
    await RedisHelper.removeUserFromChannel(channelId,userId);
    await rabbitmqService.publishInvalidation(
      [
        `${CachePrefix.CHANNEL_MEMBERSHIP_USER_PREFIX}${channelId}:${userId}`,
      ],
      "channel"
    );
    return res.json({
      success: true,
      message: "Member removed from channel",
      membership: existingMember,
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

exports.join_channel_invite = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { channelId, code } = req.body;

  try {
    const [channel, user] = await Promise.all([
      RedisHelper.getOrCacheChannel(channelId, `${CachePrefix.CHANNEL_PREFIX}${channelId}`),
      User.findById(user_id).select("email").lean(),
    ]);

    if (!channel) {
      return res.json({ success: false, message: "Channel not found." });
    }
    const existingMembership = await RedisHelper.getChannelMembership(user_id, channelId);
    if (existingMembership?.status === "joined") {
      const joinedTopics = await TopicMembership.find({
        channel: channelId,
        user: user_id,
        status: "joined",
      })
        .select("topic")
        .lean();

      return res.json({
        success: true,
        message: "You are already a member of this channel.",
        topics: joinedTopics.map((t) => t.topic),
        channel,
        membership: existingMembership,
        joined: true,
        joinStatus: "already",
      });
    }
    const invite = await Invite.findOne({ channel: channelId, code });
    if (
      !invite ||
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
    const channelMembership = await RedisHelper.getChannelMembership(invite.user, channelId);
    if(!channelMembership || (channelMembership.role !== "owner" &&  channelMembership.role !== "admin")){
      return res.json({
        success: false,
        message: "Invite code is not valid.",
      });
    }
    let usersCount = await RedisHelper.getUsersCount(channel.business,channelId);
    let myPlan = await RedisHelper.getBusinessPlan(channel.business);
    if((!myPlan && usersCount >= 30) || (myPlan && myPlan.features.userLimit<=usersCount)){
      if(channel.business){
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
        joined:false,
        isBusiness: channel.business?true:false,
        message:"Channel room is full. Contact administrator for access.",
      });
    }
    invite.used_by.push(user_id);
    await invite.save();
    let membership;
    const cacheKeys=[];
    if (existingMembership) {
      existingMembership.status = "joined";
      membership = await existingMembership.save();
      cacheKeys.push(`${CachePrefix.CHANNEL_MEMBERSHIP_USER_PREFIX}${channelId}:${user_id}`);
      if(channel.business){
        await RedisHelper.removeRequestFromBusinessArray(`${CachePrefix.CHANNEL_BUSINESS_REQUESTS_PREFIX}${channel.business}`, existingMembership._id);
      }
    } else {
      membership = await ChannelMembership.create({
        channel: channelId,
        user: user_id,
        business: channel.business || null,
        email: user.email,
        status: "joined",
      });
    }
    const publicTopics = (channel.topics || []).filter(
      (t) => t.visibility === "anyone"
    );
    const topicIds = publicTopics.map((t) => t._id);

    if (topicIds.length) {
      const topicMemberships = topicIds.map((topicId) => ({
        topic: topicId,
        user: user_id,
        channel: channel._id,
        business: channel.business || null,
        email: user.email,
        status: "joined",
      }));
      await TopicMembership.bulkWrite(
        topicMemberships.map((doc) => ({ insertOne: { document: doc } }))
      );
      await emailRabbitmqService.sendTopicMembershipRedisSyncJob({
        topicIds,
        userId: user_id,
      });

    }
    const request_membership  = membership.toObject();
    await membership.populate([
      { path: "user", select: "_id name username logo color_logo email" },
      { path: "channel", select: "_id name logo" },
    ]);
    await RedisHelper.addUserToChannel(channelId,membership);
    if(channel.business){
      await RedisHelper.addUserToBusiness(channel.business, user_id);
    }
    const topicCacheKeys = topicIds.map(
      (id) => `${CachePrefix.TOPICS_MEMBERS_PREFIX}${id}`
    );
    await rabbitmqService.publishInvalidation(
      [
        ...cacheKeys,
        ...topicCacheKeys,
      ],
      "channel"
    );

    return res.json({
      success: true,
      message: "Channel joined successfully.",
      channel: {
        ...channel,
        topics: publicTopics,
      },
      topics: topicIds,
      membership: request_membership,
      joined: true,
      joinStatus: "first",
    });
  } catch (error) {
    console.error("join_channel_invite error:", error);
    return res.json({
      success: false,
      message: "Failed to join invite.",
      error: error.message,
    });
  }
};
