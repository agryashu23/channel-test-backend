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
const rabbitmqService = require("../services/rabbitmqService");
const linkUserMemberships = require("../../utils/linkMembership");
const redisService = require("../services/redisService");

// Cache key patterns
const CHANNEL_PREFIX = "channel:";
const CHANNELS_CREATED_PREFIX = "channels:created:";
const CHANNELS_MEMBERS_PREFIX = "channels:members:";

const TOPIC_PREFIX = "topic:";
const TOPICS_MEMBERS_PREFIX = "topics:members:";
const TOPICS_ALL_CHANNEL_PREFIX = "topics:all:channel:";


const USER_PREFIX = "user:";

const {
  deleteImageFromS3,
  uploadFileToS3,
  uploadMultipleVideos,
  generateThumbnail,
  uploadSingleImageLogo,
  uploadSingleImage,
  apiMetadata,
  apiMetadata2,
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
  const { name, description, visibility, logo, cover_image, imageSource } =
    req.body;

  if (!user_id) {
    return res.json({
      success: false,
      message: "User id is required.",
    });
  }
 

  const user = await User.findById(user_id);
  const business_id = user.business;
  let logoUrl = logo ||null;
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
    };

    let channel = await Channel.create(channel_data);
    await ChannelMembership.create({
      channel: channel._id,
      user: user_id,
      role: "owner",
      email: user.email,
      status: "joined",
    });
    await channel.populate([{path:"user",select:"name username _id logo color_logo"}]);
    const createdChannelsCacheKey = `${CHANNELS_CREATED_PREFIX}${user_id}`;
   
      await rabbitmqService.publishInvalidation(
        [createdChannelsCacheKey],
      "channel"
    );

    return res.json({
      success: true,
      message: "Channel created",
      channel: {
        ...channel.toObject(),
        members: [],
      },
    });
  } catch (error) {
    res.json({ success: false, error: "Channel can't be created." });
  }
};

exports.update_channel = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { _id, name, description, visibility, logo, cover_image, imageSource } =
    req.body;

  if (!user_id) {
    return res.status(400).json({
      success: false,
      message: "User id is required.",
    });
  }
  const user = await User.findById(user_id);
  const business_id = user.business;

  const existingChannel = await Channel.findById(_id);
  if (existingChannel.user.toString() !== user_id) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to edit this channel.",
    });
  }

  const channelCacheKey = `${CHANNEL_PREFIX}${_id}`;
  const createdChannelsCacheKey = `${CHANNELS_CREATED_PREFIX}${user_id}`;

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
    };

    const updatedChannel = await Channel.findByIdAndUpdate(_id, updateData, {
      new: true,
    });
    await updatedChannel.populate([{path:"user",select:"name username _id logo color_logo"}]);

    await rabbitmqService.publishInvalidation(
      [createdChannelsCacheKey, channelCacheKey],
      "channel"
    );
    let channelMembers = [];
    const cacheKey = `${CHANNELS_MEMBERS_PREFIX}${_id}`;
    cachedMembers = await redisService.getCache(cacheKey);
    if (cachedMembers) {
      channelMembers = cachedMembers;
    }else{
      channelMembers = await ChannelMembership.find({
        channel: _id,
        user: { $ne: null },
        role:{$ne:"owner"}
      }).lean();
      await redisService.setCache(cacheKey, channelMembers, 7200);
    }
    return res.json({
      success: true,
      message: "Channel updated successfully.",
      channel: {
        ...updatedChannel.toObject(),
        members: channelMembers,
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
    const cacheKey = `${CHANNELS_MEMBERS_PREFIX}${channelId}`;
    const cachedMembers = await redisService.getCache(cacheKey);
    if (cachedMembers) {
      return res.json({
        success: true,
        message: "Members fetched successfully from cache",
        members: cachedMembers,
      });
    }
    const channelMembers = await ChannelMembership.find({channel:channelId, user:{$ne:null}, status:"joined",role:{$ne:"owner"}}).
    populate({path:"user",select:"name username _id logo color_logo"}).lean();
    await redisService.setCache(cacheKey, channelMembers, 7200);
   
    res.json({
      success: true,
      message: "Members fetched successfully" ,
      members: channelMembers,
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
    const channel = await Channel.findById(channelId).lean();
    if (!channel || channel.user.toString() !== user_id) {
      return res.json({ success: false, message: "Channel not found or user is unauthorized."});
    }
    channel.cover_image = "";
    await channel.save();
    const channelCacheKey = `${CHANNEL_PREFIX}${channelId}`;
    await rabbitmqService.publishInvalidation(
      [channelCacheKey],
      "channel"
    );
    let channelMembers = [];
    const cacheKey = `${CHANNELS_MEMBERS_PREFIX}${channelId}`;
    cachedMembers = await redisService.getCache(cacheKey);
    if (cachedMembers) {
      channelMembers = cachedMembers;
    }else{
      channelMembers = await ChannelMembership.find({
        channel: channelId,
        user: { $ne: null },
        role:{$ne:"owner"}
      }).lean();
      await redisService.setCache(cacheKey, channelMembers, 7200);
    }
    return res.json({
      success: true,
      message: "Cover image removed successfully",
      channel: {
        ...channel,
        members: channelMembers,
      },
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
    const channelExist = await Channel.findById(channel).lean();
    if (!channelExist || channelExist.user.toString() !== user_id) {
      return res.json({ success: false, message: "Channel not found or user is unauthorized." });
    }
    let cover_image = channelExist.cover_image || null;
    if (req.file) {
      cover_image = await uploadSingleImage(req.file.buffer, "channelCover");
    }
    channelExist.cover_image = cover_image;
    await channelExist.save();
    if(req.file){
      const channelCacheKey = `${CHANNEL_PREFIX}${channel}`;
      const createdChannelsCacheKey = `${CHANNELS_CREATED_PREFIX}${user_id}`;
      await rabbitmqService.publishInvalidation(
        [channelCacheKey,createdChannelsCacheKey],
        "channel"
      );
    }
    let channelMembers = [];
    const cacheKey = `${CHANNELS_MEMBERS_PREFIX}${channelExist._id}`;
    cachedMembers = await redisService.getCache(cacheKey);
    if (cachedMembers) {
      channelMembers = cachedMembers;
    }else{
      channelMembers = await ChannelMembership.find({
        channel: channelExist._id,
        user: { $ne: null },
        role:{$ne:"owner"}
      }).lean();
      await redisService.setCache(cacheKey, channelMembers, 7200);
    }
    return res.json({
      success: true,
      message: "Cover image updated successfully",
      channel: {
        ...channelExist,
        members: channelMembers,
      },
    });
  } catch (error) {
    console.error("Error in changing cover image:", error);
    res.json({ success: false, message: "Error in changing cover image." });
  }
};

exports.fetch_community_channel = async function (req, res) {
  const channelId = "678798aef9e3a667d5a5d1ea";

  try {
    const channel = await Channel.findById(channelId).populate([
      { path: "topics", select: "name _id editability visibility" },
      { path: "user", select: "name username _id" },
    ]).lean();
    if (!channel) {
      return res.json({ success: false, message: "Channel not found" });
    }
    let channelMembers = [];
    const cacheKey = `${CHANNELS_MEMBERS_PREFIX}${channelId}`;
    cachedMembers = await redisService.getCache(cacheKey);
    if (cachedMembers) {
      channelMembers = cachedMembers;
    }else{
      channelMembers = await ChannelMembership.find({
        channel: channelId,
        user: { $ne: null },
        role:{$ne:"owner"}
      }).lean();
      await redisService.setCache(cacheKey, channelMembers, 7200);
    }
    return res.json({
      success: true,
      message: "Channel fetched successfully",
      channel: {
        ...channel,
        members: channelMembers,
      },
    });
  } catch (error) {
    console.error("Error in fetching channel:", error);
    res.json({ success: false, message: "Error in fetching channel." });
  }
};

exports.fetch_my_channels = async function (req, res, next) {
  const user_id = res.locals.verified_user_id;
  try {
    if (!user_id) {
      return res.json({
        success: false,
        message: "User not found",
      });
    }
    const createdChannelscacheKey = `${CHANNELS_CREATED_PREFIX}${user_id}`;
    const [channelMemberships, topicMemberships, createdcachedChannels] = await Promise.all([
      ChannelMembership.find({ user: user_id, status: "joined",role:{$ne:"owner"} }).select("channel").lean(),
      TopicMembership.find({ user: user_id, status: "joined",role:{$ne:"owner"} }).select("topic channel").lean(),
      redisService.getCache(createdChannelscacheKey),
      // null
    ]);

    const channelIds = channelMemberships.map(entry => entry.channel);
    const topicMap = topicMemberships.reduce((acc, { topic, channel }) => {
      const chId = channel.toString();
      if (!acc[chId]) acc[chId] = new Set();
      acc[chId].add(topic.toString());
      return acc;
    }, {});

    const joinedChannelsRaw = await Channel.find({ _id: { $in: channelIds } })
      .populate([{ path: "topics", select: "name _id editability visibility" },{path:"user",select:"name username _id logo color_logo"}])
      .lean();

      const joinedChannels = joinedChannelsRaw.map(channel => {
        const allowedTopicIds = topicMap[channel._id.toString()] || new Set();
        const topicMapById = new Map(
          (channel.topics || []).map(topic => [topic._id.toString(), topic])
        );
        const sortedFilteredTopics = (channel.topics || [])
          .map(t => t._id.toString())
          .filter(id => allowedTopicIds.has(id))
          .map(id => topicMapById.get(id));
      
        return {
          ...channel,
          topics: sortedFilteredTopics,
        };
      });
      

    if (createdcachedChannels) {
      return res.json({
        success: true,
        message: "Channels fetched successfully from cache",
        channels: [...createdcachedChannels, ...joinedChannels],
      });
    }

    const createdChannels = await Channel.find({ user: user_id })
      .populate([{ path: "topics", select: "name _id editability visibility" },{path:"user",select:"name username _id logo color_logo"}])
      .lean();

    await redisService.setCache(createdChannelscacheKey, createdChannels, 7200);

    res.json({
      success: true,
      message: "Channels fetched successfully",
      channels: [...createdChannels, ...joinedChannels],
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
  const { username } = req.body;

  try {
    const user = await User.findOne({ username: username });
    const cacheKey = `${CHANNELS_CREATED_PREFIX}${user._id}`;
    const cachedChannels = await redisService.getCache(cacheKey);
    // const cachedChannels = null;
    if (cachedChannels) {
      const channelMembers = await ChannelMembership.find({channel:{$in:cachedChannels.map(channel=>channel._id)},user:{$ne:null},role:{$ne:"owner"}}).lean();
      const channelMembersMap = new Map();
      channelMembers.forEach(member => {
      const channelId = member.channel.toString(); 
      if (!channelMembersMap.has(channelId)) {
        channelMembersMap.set(channelId, []);
      }
      channelMembersMap.get(channelId).push(member);
    });
      return res.json({
        success: true,
        message: "Channels fetched successfully from cachef",
        channels: cachedChannels.map(channel=>({
          ...channel,
          members: channelMembersMap.get(channel._id.toString()) || [],
        })),
      });
    }
    const channels = await Channel.find({ user: user._id }).populate([
      { path: "topics", select: "name _id editability visibility" },
      { path: "user", select: "name username _id logo color_logo" },
    ]).lean();
    const channelMembers = await ChannelMembership.find({channel:{$in:channels.map(channel=>channel._id)},user:{$ne:null},role:{$ne:"owner"}}).lean();
    const channelMembersMap = new Map();
    channelMembers.forEach(member => {
      const channelId = member.channel.toString(); 
      if (!channelMembersMap.has(channelId)) {
        channelMembersMap.set(channelId, []);
      }
      channelMembersMap.get(channelId).push(member);
    });
    
    if (channels.length > 0) {  
      const channelsWithMembers = channels.map(channel => ({
        ...channel,
        members: channelMembersMap.get(channel._id.toString()) || [],
      }));
      await redisService.setCache(cacheKey, channels, 7200);
      return res.json({
        success: true,
        message: "Channels fetched successfully",
        channels: channelsWithMembers,
      });
    }
    res.json({
      success: true,
      message: "No Channels found",
      channels: [],
    });
  } catch (error) {
    console.error("Error in fetching channels", error);
    res.status(500).json({
      success: false,
      message: "Error in fetching channels",
      error: error.message,
    });
  }
};

exports.fetch_channel = async function (req, res, next) {
  const { id } = req.body;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Channel ID",
    });
  }
  try {
    const cacheKey = `${CHANNEL_PREFIX}${id}`;
    const cacheChannelMembersKey = `${CHANNELS_MEMBERS_PREFIX}${id}`;
    const [cachedChannel, cachedChannelMembers] = await Promise.all([
      redisService.getCache(cacheKey),
      redisService.getCache(cacheChannelMembersKey),
      // null,
      // null
    ]);
    let members = cachedChannelMembers;
    if (!cachedChannelMembers) {
      members = await ChannelMembership.find({ channel: id, user: { $ne: null },role:{$ne:"owner"} }).lean();
      await redisService.setCache(cacheChannelMembersKey, members, 3600);
    }
    if (cachedChannel) {
      return res.json({
        success: true,
        message: "Channel fetched successfully from cache",
        channel: {
          ...cachedChannel,
          members,
        },
      });
    }
    const channel = await Channel.findById(id)
      .populate([
        { path: "topics", select: "name _id editability visibility" },
        { path: "user", select: "name username _id logo color_logo" },
      ])
      .lean();

    if (!channel) {
      return res.json({
        success: false,
        message: "No Channel found",
      });
    }
    await redisService.setCache(cacheKey, channel, 3600);
    return res.json({
      success: true,
      message: "Channel fetched successfully",
      channel: {
        ...channel,
        members,
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
    const channel = await Channel.findById(id).lean();
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
    const topicInvalidationPatterns = allTopics.map(topicId => [
      `${TOPIC_PREFIX}${topicId}`,
      `${TOPICS_MEMBERS_PREFIX}${topicId}`,
    ]).flat();
    
   
    const cacheKeys = [
      `${CHANNEL_PREFIX}${id}`,
      `${CHANNELS_CREATED_PREFIX}${user_id}`,
      `${CHANNELS_MEMBERS_PREFIX}${id}`,
      `${TOPICS_ALL_CHANNEL_PREFIX}${id}`,
      ...topicInvalidationPatterns,
    ];

    await rabbitmqService.publishInvalidation(cacheKeys, "channel");
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
    const channel = await Channel.findById(channelId).populate([{path:"topics",select:"name _id editability visibility"},
      {path:"user",select:"name username _id logo color_logo"}]).lean();
    if (!channel) {
      return res.json({ success: false, message: "Channel not found." });
    }
    const user = await User.findById(user_id).select("email").lean();

    const existing = await ChannelMembership.findOne({ channel: channelId, user: user_id });
    if (existing) {
      if (existing.status === "joined") {
        const allTopicsJoined = await TopicMembership.find({
          channel: channelId,
          user: user_id,
          status: "joined",
        }).select("topic").lean();

        return res.json({
          success: true,
          message: "You are already a member of this channel",
          topics: allTopicsJoined.map(t => t.topic),
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

    if (channel.visibility === "anyone") {
      const membership = await ChannelMembership.create({
        channel: channelId,
        user: user_id,
        email: user.email,
        business: channel.business || null,
        status: "joined",
      });

      const publicTopics = channel.topics.filter(t => t.visibility === "anyone");
      const topicIds = publicTopics.map(t => t._id);
      let topicMemberships = [];
      if (topicIds.length) {
        const bulkOps = topicIds.map(topicId => {
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
        const topicCacheKeys = topicIds.map(id => `${TOPICS_MEMBERS_PREFIX}${id}`);
        await rabbitmqService.publishInvalidation(
          [ `${CHANNELS_MEMBERS_PREFIX}${channel._id}`, ...topicCacheKeys ],
          "channel"
        );
      }
      return res.json({
        success: true,
        message: "Channel joined successfully.",
        channel: {
          ...channel,
          topics: publicTopics,
        },
        topics:topicIds,
        membership: membership,
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

      await rabbitmqService.publishInvalidation(
        [ `${CHANNELS_MEMBERS_PREFIX}${channel._id}` ],
        "channel"
      );

      return res.json({
        success: true,
        message: "Request sent successfully. Please wait for approval.",
        channel,
        membership: membership,
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
    const channel = await Channel.findById(channelId).populate([{path:"user",select:"name username _id logo color_logo"}]).lean();
    if (!channel) {
      return res.json({
        success: false,
        message: "No channel found.",
      });
    }
    const topicIds = channel.topics || [];

    const topicMemberships = await TopicMembership.find({ channel: channelId, user: user_id });
    const [membership,abcd] = await Promise.all([
      ChannelMembership.findOneAndDelete({ channel: channelId, user: user_id }),
      TopicMembership.deleteMany({ channel: channelId, user: user_id }),
    ]);
    const topicMemberCacheKeys = topicIds.map(
      topicId => `${TOPICS_MEMBERS_PREFIX}${topicId}`
    );
    const topicCacheKey = `${TOPICS_ALL_CHANNEL_PREFIX}${channelId}`;
    const cacheKeys = [
      `${CHANNELS_MEMBERS_PREFIX}${channelId}`,
      ...topicMemberCacheKeys,
      topicCacheKey,
    ];
    await rabbitmqService.publishInvalidation(
      cacheKeys,
      "channel"
    );
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


exports.join_channel_invite = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { channelId, code } = req.body;

  try {
    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.json({
        success: false,
        message: "Channel not found.",
      });
    }
    const user = await User.findById(user_id).select("email").lean();
    const alreadyExists = await ChannelMembership.findOne({channel:channelId,user:user_id});
    if(alreadyExists){
      return res.json({
        success: true,
        message: "You are already a member of this channel.",
        channel: channel,
      });
    }
    const invite = await Invite.findOne({ channel: channelId, code: code });
    if (
      !invite ||
      invite.user.toString() !== channel.user.toString()
    ) {
      return res.json({
        success: false,
        message: "Unauthorized invite code.",
      });
    }
    if(invite.status==="expired" || ( invite.expire_time && invite.expire_time < new Date())){
      return res.json({
        success: false,
        message: "Invite code expired.",
      });
    }
      invite.used_by.push(user_id);
      await invite.save();
    const channelmembership = await ChannelMembership.create({channel:channelId,user:user_id,business:channel.business,email:user.email, status:"joined"}).lean();
    const membersCacheKey = `${CHANNELS_MEMBERS_PREFIX}${channelId}`;
    await rabbitmqService.publishInvalidation(
      [
        membersCacheKey,
      ],
      "channel"
    );

    return res.json({
      success: true,
      message: "Channel joined successfully.",
      channel: channel,
      membership: channelmembership,
    });
  } catch (error) {
    return res.json({
      success: false,
      message: "Failed to join invite.",
      error: error.message,
    });
  }
};


exports.accept_channel_request = async function (req, res, next) {
  const { channelId, userId } = req.query;
  const user_id = res.locals.verified_user_id;

  try {
    const channel = await Channel.findById(channelId);
    if (!channel || channel.user.toString() !== user_id.toString()) {
      return res.json({
        success: false,
        message: "No channel found or you are not the owner.",
      });
    }
    const membership = await ChannelMembership.findOneAndUpdate({channel:channelId,user:userId,status:"request"},{status:"joined"},{new:true}).lean();
    const membersCacheKey = `${CHANNELS_MEMBERS_PREFIX}${channelId}`;
    await rabbitmqService.publishInvalidation(
      [membersCacheKey],
      "channel"
    );
    return res.json({
      success: true,
      message: "Channel joined successfully.",
      channel: channel,
      membership: membership,
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
  const { channelId, userId } = req.query;
  const user_id = res.locals.verified_user_id;

  try {
    const channel = await Channel.findById(channelId);
    if (!channel || channel.user.toString() !== user_id.toString()) {
      return res.json({
        success: false,
        message: "No channel found or you are not the owner.",
      });
    }
    const existingRequest = await ChannelMembership.findOne({channel:channelId,user:userId,status:"request"});
    if(existingRequest){
      await existingRequest.deleteOne();
    }
    const membersCacheKey = `${CHANNELS_MEMBERS_PREFIX}${channelId}`;
    await rabbitmqService.publishInvalidation(
      [
        membersCacheKey,
      ],
      "channel"
    );
    return res.json({
      success: true,
      message: "Channel request declined successfully.",
      channel: channel,
      membership: existingRequest,
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
  if (
    !channelId || !userId
  ) {
    return res.json({
      success: false,
      message: "Invalid Channel ID or User ID",
    });
  }
  try {
    const channel = await Channel.findOne({ _id: channelId, user: user_id });
    if (!channel || channel.user.toString() !== user_id.toString()) {
      return res.json({
        success: false,
        message: "No channel found or you are not the owner.",
      });
    }
    const existingMember = await ChannelMembership.findOneAndDelete({channel:channelId,user:userId,status:"joined"});
    const affectedTopicMemberships = await TopicMembership.find({
      channel: channelId,
      user: userId,
      status: "joined",
    }).lean();

    await TopicMembership.deleteMany({
      channel: channelId,
      user: userId,
      status: "joined",
    });
    const membersCacheKey = `${CHANNELS_MEMBERS_PREFIX}${channelId}`;
    const topicCacheKeys = affectedTopicMemberships.map(
      (tm) => `${TOPICS_MEMBERS_PREFIX}${tm.topic}`
    );

    await rabbitmqService.publishInvalidation(
      [membersCacheKey, ...topicCacheKeys],
      "channel"
    );
    return res.json({
      success: true,
      message: "Member removed from channel",
      channel:channel,
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
