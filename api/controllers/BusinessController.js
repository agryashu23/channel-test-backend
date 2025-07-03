require("dotenv").config();
const mongoose = require("mongoose");
const ChannelMembership = mongoose.model("ChannelMembership");
const TopicMembership = mongoose.model("TopicMembership");
const EventMembership = mongoose.model("EventMembership");
const Channel = mongoose.model("Channel");
const Topic = mongoose.model("Topic");
const User = mongoose.model("User");
const Event = mongoose.model("Event");
const Business = mongoose.model("Business");
const Transaction = mongoose.model("Transaction");
const Plan = mongoose.model("Plan");

const { uploadFileToS3 } = require("../aws/uploads/Images");

const pLimit = require("p-limit");
const redisService = require("../services/redisService");
const {
  preprocessMembershipRows,
  syncMembershipsFromAdminInitial,
  syncMembershipsFromAdmin,
} = require("../../utils/linkMembership");
const rabbitmqService = require("../services/rabbitmqService");

const BUSINESS_PREFIX = "embed:business:";

exports.fetch_business_credentials = async function (req, res) {
  const { username } = req.body;

  try {
    const user = await User.findOne({ username }).select("_id").lean();
    if (!user) {
      return res.json({
        success: false,
        message: "Invalid username",
      });
    }
    const user_id = user._id;
    const cacheKey = `${BUSINESS_PREFIX}${user_id}`;
    //  const cachedVal = await redisService.getCache(cacheKey);
    //  if (cachedVal) {
    //    return res.json(cachedVal);
    //  }
    const business = await Business.findOne({ user_id }).lean();

    if (!business) {
      return res.json({ success: false, message: "Invalid account details" });
    }
    const response = {
      success: true,
      message: "Fetched credentials",
      business: business,
    };
    await redisService.setCache(cacheKey, response, 3600);
    return res.json(response);
  } catch (error) {
    return res.json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

exports.save_admin_api = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { api, description } = req.body;
  if (!api) {
    return res.status(400).json({
      success: false,
      message: "API code is required.",
    });
  }

  try {
    const business = await Business.findOne({ user_id });
    const cacheKey = `${BUSINESS_PREFIX}${user_id}`;

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Invalid account details",
      });
    }
    business.apiData.push({ api, description });
    await business.save();
    await rabbitmqService.publishInvalidation([cacheKey], "embed");
    return res.status(200).json({
      success: true,
      message: "API saved successfully",
      apis: business.apiData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
      error: error.message,
    });
  }
};

exports.save_admin_upload = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { fileData, description } = req.body;

  const imageData = JSON.parse(fileData);

  try {
    const business = await Business.findOne({ user_id });
    const cacheKey = `${BUSINESS_PREFIX}${user_id}`;
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Invalid account details",
      });
    }
    let imageUrl = "";
    if (req.file) {
      imageUrl = await uploadFileToS3(req.file, "business");
    }
    const data = {
      url: imageUrl,
      description: description,
      name: imageData.name,
      size: imageData.size,
    };

    business.filesData.push(data);
    await business.save();
    await rabbitmqService.publishInvalidation([cacheKey], "embed");
    return res.status(200).json({
      success: true,
      message: "Upload saved successfully",
      files: business.filesData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
      error: error.message,
    });
  }
};

exports.request_login_auto = async function (req, res) {
  const { apiKey } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    const cacheKey = `${BUSINESS_PREFIX}${user_id}`;
    const business = await Business.findOne({ apiKey: apiKey });
    if (!business) {
      return res.json({
        success: false,
        message: "No business found with the provided apiKey.",
      });
    }
    business.auto_login_request = true;
    await business.save();
    await rabbitmqService.publishInvalidation([cacheKey], "embed");
    return res.json({
      success: true,
      message: "Auto Login request done successfully.",
    });
  } catch (error) {
    console.error("Failed to auto login request:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to auto login request." });
  }
};

exports.syncInitialAdminData = async function (req, res) {
  const limit = pLimit(10);
  const { rawRows, business } = req.body;
  const { validRows } = preprocessMembershipRows(rawRows);
  const results = [];
  const channelCache = new Map();
  const topicCache = new Map();
  try {
    await Promise.all(
      validRows.map((row) =>
        limit(async () => {
          const result = await syncMembershipsFromAdminInitial({
            business,
            ...row,
            channelCache,
            topicCache,
          });
          results.push(result);
        })
      )
    );
    const allCacheKeys = results.flatMap((r) => r.cacheKeys);
    await rabbitmqService.publishInvalidation(allCacheKeys, "admin");
    return res.json({
      success: true,
      message: "Admin data synced successfully validating in 30-60 seconds",
    });
  } catch (error) {
    console.error(error);
    res.json({
      success: false,
      message: "Error syncing admin data. Please try again later.",
    });
  }
};

exports.syncAdminData = async function (req, res) {
  const { email, channelName, business } = req.query;
  let topicNames = [];
  try {
    topicNames = JSON.parse(req.query.topicNames || "[]");
    if (!Array.isArray(topicNames)) throw new Error("Invalid");
  } catch (err) {
    return res.json({
      success: false,
      message: "Invalid topicNames format. Must be a JSON array.",
    });
  }
  if (!email || !channelName || !business) {
    return res.json({
      success: false,
      message: "Missing required query parameters.",
    });
  }
  try {
    const result = await syncMembershipsFromAdmin({
      business,
      email,
      channelName,
      topicNames,
    });
    await rabbitmqService.publishInvalidation(result, "admin");
    return res.json({
      success: true,
      message: "Admin data synced successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Error syncing admin data. Please try again later.",
    });
  }
};

exports.fetch_channel_requests = async function (req, res) {
  const user_id = res.locals.verified_user_id;

  try {
    const [business, channels] = await Promise.all([
      Business.findOne({ user_id: user_id }).select("_id").lean(),
      Channel.find({ user: user_id }).select("_id name logo").lean(),
    ]);
    if (!channels.length) {
      return res.json({
        success: true,
        message: "No channels found.",
        requests: [],
        channels: channels,
      });
    }
    const channelIds = channels.map((channel) => channel._id);
    const channelRequests = await ChannelMembership.find({
      channel: { $in: channelIds },
      status: "request",
      business: business._id,
      user: { $ne: null },
    }).populate([
      { path: "user", select: "_id name username logo color_logo email" },
      { path: "channel", select: "_id name logo" },
    ]);

    return res.json({
      success: true,
      message: "Fetched requests",
      requests: channelRequests,
      channels: channels,
    });
  } catch (error) {
    return res.json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

exports.fetch_topic_requests = async function (req, res) {
  const user_id = res.locals.verified_user_id;

  try {
    const [business, channels] = await Promise.all([
      Business.findOne({ user_id: user_id }).select("_id").lean(),
      Channel.find({ user: user_id })
        .select("_id name logo topics")
        .populate({ path: "topics", select: "_id name" })
        .lean(),
    ]);
    if (!channels.length) {
      return res.json({
        success: true,
        message: "No channels found.",
        requests: [],
        channels: channels,
      });
    }
    const topicIds = channels.flatMap((channel) =>
      channel.topics.map((topic) => topic._id)
    );
    const channelIds = channels.map((channel) => channel._id);
    const topicRequests = await TopicMembership.find({
      channel: { $in: channelIds },
      status: "request",
      business: business._id,
      topic: { $in: topicIds },
      user: { $ne: null },
    }).populate([
      { path: "user", select: "_id name username logo color_logo email" },
      { path: "topic", select: "_id name" },
    ]);

    return res.json({
      success: true,
      message: "Fetched requests",
      requests: topicRequests,
      channels: channels,
    });
  } catch (error) {
    return res.json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

exports.fetch_event_requests = async function (req, res) {
  const user_id = res.locals.verified_user_id;

  try {
    const [business, events] = await Promise.all([
      Business.findOne({ user_id: user_id }).select("_id").lean(),
      Event.find({ user: user_id })
        .select(
          "_id name type startDate endDate startTime endTime locationText location meet_url cover_image"
        )
        .lean(),
    ]);
    if (!events.length) {
      return res.json({
        success: true,
        message: "No events found.",
        requests: [],
        events: events,
      });
    }
    const eventIds = events.map((event) => event._id);
    const eventRequests = await EventMembership.find({
      event: { $in: eventIds },
      status: "request",
      user: { $ne: null },
    })
      .select("event user joinedAt")
      .populate([
        { path: "user", select: "_id name username logo color_logo email" },
      ]);
    return res.json({
      success: true,
      message: "Fetched requests",
      requests: eventRequests,
      events: events,
    });
  } catch (error) {
    return res.json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

exports.update_admin_params = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { allowDM, talkToBrand } = req.body;

  try {
    const cacheKey = `${BUSINESS_PREFIX}${user_id}`;
    const business = await Business.findOne({ user: user_id });
    if (!business) {
      return res.json({
        success: false,
        message: "No business found.",
      });
    }
    if (!business.parameters) {
      business.parameters = {};
    }
    business.parameters.allowDM = allowDM;
    business.parameters.talkToBrand = talkToBrand;
    await business.save();
    await rabbitmqService.publishInvalidation([cacheKey], "embed");
    return res.json({
      success: true,
      message: "Parameters updated successfully",
    });
  } catch (error) {
    return res.json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

exports.update_topic_summary_settings = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { data, allowSummary } = req.body;

  if (!Array.isArray(data)) {
    return res.json({
      success: false,
      message: "Invalid data format. Expected an array of topic settings.",
    });
  }

  try {
    const business = await Business.findOne({ user: user_id }).select(
      "chatSummary"
    );
    if (business) {
      business.chatSummary = allowSummary;
      await business.save();
    }
    if (allowSummary && data.length > 0) {
      const bulkOps = data.map(
        ({ topic, channel, summaryEnabled, summaryType, summaryTime }) => ({
          updateOne: {
            filter: { _id: topic, channel },
            update: {
              $set: {
                summaryEnabled,
                summaryType,
                summaryTime,
              },
            },
          },
        })
      );

      await Topic.bulkWrite(bulkOps);
    }
    return res.json({
      success: true,
      message: "Topic summary settings updated successfully",
    });
  } catch (error) {
    return res.json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

exports.update_business_customizations = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const {
    whatsappNotifications,
    chatSummary,
    allowDM,
    talkToBrand,
    loginControl,
  } = req.body;
  try {
    const business = await Business.findOne({ user_id: user_id });
    if (!business) {
      return res.json({ success: false, message: "Business not found" });
    }
    if (!business.parameters) {
      business.parameters = {};
    }
    business.whatsappNotifications = whatsappNotifications;
    business.chatSummary = chatSummary;
    business.parameters.allowDM = allowDM;
    business.parameters.talkToBrand = talkToBrand;
    business.loginControl = loginControl || "api";
    await business.save();
    return res.json({
      success: true,
      message: "Business customizations updated successfully",
      business: business,
    });
  } catch (error) {
    return res.json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

exports.fetch_business_channels_topics = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  try {
    const channels = await Channel.find({ user: user_id })
      .select("_id name logo topics")
      .populate({ path: "topics", select: "_id name" })
      .lean();
    if (!channels || channels.length === 0) {
      return res.json({
        success: true,
        message: "No channels found",
        channels: [],
      });
    }
    return res.json({
      success: true,
      message: "Fetched channels and topics successfully",
      channels: channels,
    });
  } catch (error) {
    console.error("Error fetching channels and topics:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

exports.fetch_roles_and_members = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { channelId, topicId } = req.body;
  if (!user_id) {
  }
  if (!channelId) {
    return res.json({ members: [], topics: [] });
  }

  try {
    let members = [];
    if (topicId) {
      const topicMemberships = await TopicMembership.find({
        topic: topicId,
        status: "joined",
        role: { $ne: "owner" },
      })
        .populate([
          { path: "user", select: "_id name username email logo color_logo" },
        ])
        .lean();

      members = topicMemberships;
    } else {
      const channelMemberships = await ChannelMembership.find({
        channel: channelId,
        status: "joined",
        role: { $ne: "owner" },
      })
        .populate([
          { path: "user", select: "_id name username email logo color_logo" },
        ])
        .lean();
      members = channelMemberships;
    }
    return res.json({
      success: true,
      members: members || [],
      message: "Fetched members successfully",
    });
  } catch (err) {
    console.error("Error fetching members and roles:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.update_user_business_role = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { userId, role, channelId, topicId } = req.body;
  if (!user_id || !channelId || !role || !userId) {
    return res.json({
      success: false,
      message: "Unauthorized",
      error: "Unauthorized",
    });
  }
  try {
    const isOwner = await ChannelMembership.findOne({
      channel: channelId,
      user: user_id,
      role: "owner",
    });
    if (!isOwner) {
      return res.json({
        success: false,
        message: "You are not authorized to update roles.",
      });
    }
    if (channelId && topicId) {
      const membership = await TopicMembership.findOne({
        topic: topicId,
        channel: channelId,
        user: userId,
      });
      if (!membership) {
        return res.json({
          success: false,
          message: "Membership not found",
        });
      }
      membership.role = role;
      await membership.save();
      return res.json({
        success: true,
        message: "User role updated successfully",
        membership: membership,
      });
    }
    const membership = await ChannelMembership.findOne({
      channel: channelId,
      user: userId,
    });
    if (!membership) {
      return res.json({
        success: false,
        message: "Membership not found",
      });
    }
    membership.role = role;
    await membership.save();
    return res.json({
      success: true,
      message: "Role updated successfully",
      membership: membership,
    });
  } catch (err) {
    console.error("Error updating members and roles:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.remove_user_business_member = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { userId, channelId, topicId } = req.body;
  console.log(userId, channelId, topicId);

  if (!user_id || !channelId || !userId) {
    return res.json({
      success: false,
      message: "Unauthorized",
      error: "Unauthorized",
    });
  }
  try {
    const isOwner = await ChannelMembership.findOne({
      channel: channelId,
      user: user_id,
      role: "owner",
    });
    if (!isOwner) {
      return res.json({
        success: false,
        message: "You are not authorized to update roles.",
      });
    }
    if (channelId && topicId && topicId !== "null") {
      await TopicMembership.deleteOne({
        topic: topicId,
        channel: channelId,
        user: userId,
      });
      return res.json({
        success: true,
        message: "User removed from topic successfully",
        userId: userId,
      });
    }
    await Promise.all([
      TopicMembership.deleteMany({
        channel: channelId,
        user: userId,
        status: "joined",
      }),
      ChannelMembership.deleteOne({
        channel: channelId,
        user: userId,
        status: "joined",
      }),
    ]);
    return res.json({
      success: true,
      message: "User removed from channel successfully",
      userId: userId,
    });
  } catch (err) {
    console.error("Error removing user from business:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
