require("dotenv").config();
const sharp = require("sharp");
const path = require("path");
var mongoose = require("mongoose");
var Topic = mongoose.model("Topic");
var User = mongoose.model("User");
var Channel = mongoose.model("Channel");
var Event = mongoose.model("Event");
var ChannelChat = mongoose.model("ChannelChat");
var ChannelMembership = mongoose.model("ChannelMembership");
var TopicMembership = mongoose.model("TopicMembership");
var DMRoom = mongoose.model("DMRoom");
var DMChat = mongoose.model("DMChat");
var Business = mongoose.model("Business");
const redisService = require("../services/redisService");

const ANALYTICS_PREFIX = "analytics:";

exports.fetch_total_users = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  try {
    const business = await Business.findOne({ user: user_id }).select("_id").lean();
    if (!business) {
      return res.json({ success: false, message: "Business not found" });
    }
    const cacheKey = `${ANALYTICS_PREFIX}${business._id}:total_users`;
    const cachedData = await redisService.getCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, total_users: cachedData });
    }
    const total_users = await ChannelMembership.countDocuments({ business: business._id });
    await redisService.setCache(cacheKey, total_users,3600);
    return res.json({
      success: true,
      message: "Total users fetched",
      total_users,
    });
  } catch (error) {
    console.error("Error fetching total users:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


exports.fetch_total_chats = async function (req, res) {
  const user_id = res.locals.verified_user_id;

  try {
    const business = await Business.findOne({user:user_id}).select("_id").lean();
    if (!business) {
      return res.json({ success: false, message: "Business not found" });
    }
    const businessId = business?._id;
    const cacheKey = `${ANALYTICS_PREFIX}${businessId}:total_chats`;
    const cachedData = await redisService.getCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, total_chats: cachedData });
    }
    const total_chats = await ChannelChat.countDocuments({ business: businessId });
    await redisService.setCache(cacheKey, total_chats,3600);
    return res.json({ success: true, total_chats });
  } catch (error) {
    console.error("Error fetching total chats:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

exports.fetch_active_users = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    const business = await Business.findOne({ user: user_id }).select("_id").lean();
    if (!business) {
      return res.status(404).json({ success: false, message: "Business not found" });
    }
    const cacheKey = `${ANALYTICS_PREFIX}${businessId}:active_users`;
    const cachedData = await redisService.getCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData });
    }
    const data = await AnalyticsSnapshot.aggregate([
      {
        $match: {
          business: business._id,
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            user: "$user"
          }
        }
      },
      {
        $group: {
          _id: "$_id.day",
          activeUsers: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          date: "$_id",
          activeUsers: 1,
          _id: 0
        }
      }
    ]);
    await redisService.setCache(cacheKey, data,3600);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching active users chart:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};



exports.fetch_new_joins_chart = async function (req, res) {
  const user_id = res.locals.verified_user_id;

  try {
    const business = await Business.findOne({ user: user_id }).select("_id").lean();
    if (!business) {
      return res.status(404).json({ success: false, message: "Business not found" });
    }
    const cacheKey = `${ANALYTICS_PREFIX}${businessId}:new_joins`;
    const cachedData = await redisService.getCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData });
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const data = await ChannelMembership.aggregate([
      {
        $match: {
          business: business._id,
          status: "joined",
          joinedAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$joinedAt" } },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
      {
        $project: {
          _id: 0,
          date: "$_id.date",
          count: 1,
        },
      },
    ]);
    await redisService.setCache(cacheKey, data,3600);
    return res.json({ success: true, new_joins: data });
  } catch (err) {
    console.error("Error generating new joining chart:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.fetch_user_interaction_chart = async function (req, res) {
  const user_id = res.locals.verified_user_id;

  try {
    const business = await Business.findOne({ user: user_id }).select("_id").lean();
    if (!business) {
      return res.status(404).json({ success: false, message: "Business not found" });
    }
    const cacheKey = `${ANALYTICS_PREFIX}${businessId}:user_interaction`;
    const cachedData = await redisService.getCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData });
    }
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const data = await ChannelChat.aggregate([
      {
        $match: {
          business: business._id,
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            user: "$user",
          },
        },
      },
      {
        $group: {
          _id: "$_id.day",
          users: { $sum: 1 }, 
        },
      },
      {
        $sort: { _id: 1 },
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
          users: 1,
        },
      },
    ]);
    await redisService.setCache(cacheKey, data,3600);
    return res.json({ success: true, chart: data });
  } catch (err) {
    console.error("Error generating user interaction chart:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.fetch_most_active_topics = async function (req, res) {
  const user_id = res.locals.verified_user_id;

  try {
    const business = await Business.findOne({ user: user_id }).select("_id").lean();
    if (!business) {
      return res.status(404).json({ success: false, message: "Business not found" });
    }
    const cacheKey = `${ANALYTICS_PREFIX}${businessId}:most_active_topic_per_day`;
    const cachedData = await redisService.getCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, topics: cachedData });
    }
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const data = await ChannelChat.aggregate([
      {
        $match: {
          business: business._id,
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            topic: "$topic",
          },
          messageCount: { $sum: 1 },
        },
      },
      {
        $sort: {
          "_id.date": 1,
          messageCount: -1,
        },
      },
      {
        $group: {
          _id: "$_id.date",
          topicId: { $first: "$_id.topic" },
          messageCount: { $first: "$messageCount" },
        },
      },
      {
        $lookup: {
          from: "topics",
          localField: "topicId",
          foreignField: "_id",
          as: "topic",
        },
      },
      { $unwind: "$topic" },
      {
        $lookup: {
          from: "channels",
          localField: "topic.channel",
          foreignField: "_id",
          as: "channel",
        },
      },
      { $unwind: "$channel" },
      {
        $project: {
          date: "$_id",
          topicName: "$topic.name",
          channelName: "$channel.name",
          messageCount: 1,
        },
      },
      {
        $sort: { date: 1 },
      },
    ]);
    await redisService.setCache(cacheKey, data,3600);
    return res.json({ success: true, topics: data });
  } catch (err) {
    console.error("Error fetching most active topic per day:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.fetch_most_active_users = async function (req, res) {
  const user_id = res.locals.verified_user_id;

  try {
    const business = await Business.findOne({ user: user_id }).select("_id").lean();
    if (!business) {
      return res.status(404).json({ success: false, message: "Business not found" });
    }
    const cacheKey = `${ANALYTICS_PREFIX}${businessId}:most_active_users`;
    const cachedData = await redisService.getCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, users: cachedData });
    }
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const data = await AnalyticsSnapshot.aggregate([
      {
        $match: {
          business: business._id,
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: "$user",
          totalInteractions: { $sum: "$interactionCount" },
        },
      },
      {
        $sort: { totalInteractions: -1 },
      },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          username: "$user.username",
          _id: "$user._id",
          logo: "$user.logo",
          interactionCount: "$totalInteractions",
        },
      },
    ]);
    await redisService.setCache(cacheKey, data,3600);
    return res.json({ success: true, users: data });
  } catch (err) {
    console.error("Error fetching most active users:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


exports.fetch_least_active_topics = async function (req, res) {
  const user_id = res.locals.verified_user_id;

  try {
    const business = await Business.findOne({ user: user_id }).select("_id").lean();
    if (!business) {
      return res.status(404).json({ success: false, message: "Business not found" });
    }
    const cacheKey = `${ANALYTICS_PREFIX}${businessId}:least_active_topics`;
    const cachedData = await redisService.getCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, topics: cachedData });
    }
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const chatCounts = await ChannelChat.aggregate([
      {
        $match: {
          business: business._id,
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: "$topic",
          chatCount: { $sum: 1 },
        },
      },
    ]);

    const topicChatMap = new Map(chatCounts.map(doc => [String(doc._id), doc.chatCount]));

    const allTopics = await Topic.find({ business: business._id })
      .populate("channel", "name")
      .select("name channel")
      .lean();

    const topicData = allTopics.map(topic => ({
      topicId: topic._id,
      topicName: topic.name,
      channelName: topic.channel?.name || "Unknown",
      chatCount: topicChatMap.get(String(topic._id)) || 0,
    }));

    topicData.sort((a, b) => a.chatCount - b.chatCount);
    const leastActiveTopics = topicData.slice(0, 10);
    await redisService.setCache(cacheKey, leastActiveTopics,3600 );
    return res.json({ success: true, topics: leastActiveTopics });
  } catch (err) {
    console.error("Error fetching least active topics:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


exports.fetch_unseen_invites = async function (req, res) {
  const user_id = res.locals.verified_user_id;

  try {
    const business = await Business.findOne({ user: user_id }).select("_id").lean();
    if (!business) {
      return res.status(404).json({ success: false, message: "Business not found" });
    }
    const cacheKey = `${ANALYTICS_PREFIX}${businessId}:unseen_invites`;
    const cacheKey2 = `${ANALYTICS_PREFIX}${businessId}:inactive_joins`;
    const cachedData = await redisService.getCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData });
    }
    const businessId = business._id;
    const channelCounts = await ChannelMembership.aggregate([
      {
        $match: {
          business: businessId,
          status: { $in: ["request", "processing"] },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);
    let channelUnseenInvites = 0;
    let channelInactiveJoins = 0;
    for (const c of channelCounts) {
      if (c._id === "request") channelUnseenInvites = c.count;
      if (c._id === "processing") channelInactiveJoins = c.count;
    }

    const topicCounts = await TopicMembership.aggregate([
      {
        $match: {
          business: businessId,
          status: { $in: ["request", "processing"] },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);
    let topicUnseenInvites = 0;
    let topicInactiveJoins = 0;
    for (const t of topicCounts) {
      if (t._id === "request") topicUnseenInvites = t.count;
      if (t._id === "processing") topicInactiveJoins = t.count;
    }
    await redisService.setCache(cacheKey, {channelUnseenInvites, channelInactiveJoins, topicUnseenInvites, topicInactiveJoins});
    return res.json({
      success: true,
      channelUnseenInvites,
      channelInactiveJoins,
      topicUnseenInvites,
      topicInactiveJoins,
    });
  } catch (err) {
    console.error("Error fetching invite/join summary:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


exports.fetch_media_shared_chart = async function (req, res) {
  const user_id = res.locals.verified_user_id;

  try {
    const business = await Business.findOne({ user: user_id }).select("_id").lean();
    if (!business) {
      return res.status(404).json({ success: false, message: "Business not found" });
    }
    const cacheKey = `${ANALYTICS_PREFIX}${businessId}:media_shared_chart`;
    const cachedData = await redisService.getCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData });
    }
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const data = await ChannelChat.aggregate([
      {
        $match: {
          business: business._id,
          createdAt: { $gte: since },
          "media.0": { $exists: true }, // at least one media
        },
      },
      { $unwind: "$media" },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          mediaCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          date: "$_id",
          mediaCount: 1,
          _id: 0,
        },
      },
    ]);
    await redisService.setCache(cacheKey, data,3600);
    return res.json({ success: true, data });
  } catch (err) {
    console.error("Error fetching media shared chart:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


exports.fetch_poll_interaction = async function (req, res) {
  const user_id = res.locals.verified_user_id;

  try {
    const business = await Business.findOne({ user: user_id }).select("_id").lean();
    if (!business) {
      return res.status(404).json({ success: false, message: "Business not found" });
    }
    const cacheKey2 = `${ANALYTICS_PREFIX}${businessId}:poll_interaction`;
    const cachedData = await redisService.getCache(cacheKey2);
    if (cachedData) {
      return res.json({ success: true, data: cachedData });
    }
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const polls = await Poll.find({
      business: business._id,
      createdAt: { $gte: since },
    }).select("createdAt responses anonymousResponses question").lean();

    const totalPolls = polls.length;
    let totalResponses = 0;
    const responseChartMap = {};

    for (const poll of polls) {
      const date = new Date(poll.createdAt).toISOString().slice(0, 10);
      const responseCount = (poll.responses?.length || 0) + (poll.anonymousResponses?.length || 0);
      totalResponses += responseCount;
      responseChartMap[date] = (responseChartMap[date] || 0) + responseCount;
    }

    const responseChart = Object.entries(responseChartMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    await redisService.setCache(cacheKey2, {totalPolls, totalResponses, responseChart},3600);
    return res.json({
      success: true,
      totalPolls,
      totalResponses,
      responseChart,
    });
  } catch (err) {
    console.error("Error fetching poll analytics:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


exports.fetch_event_analytics_summary = async function (req, res) {
  const user_id = res.locals.verified_user_id;

  try {
    const business = await Business.findOne({ user: user_id }).select("_id").lean();
    if (!business) return res.status(404).json({ success: false, message: "Business not found" });
    const cacheKey = `${ANALYTICS_PREFIX}${businessId}:event_analytics_summary`;
    const cachedData = await redisService.getCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData });
    }
    const businessId = business._id;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const events = await Event.find({
      business: businessId,
      createdAt: { $gte: since },
    }).select("name joined_users");

    let totalJoins = 0;
    const joinChartMap = {};
    const eventBreakdown = [];

    for (const event of events) {
      let eventJoinCount = 0;

      for (const entry of event.joined_users || []) {
        if (entry.joinedAt && new Date(entry.joinedAt) >= since) {
          eventJoinCount++;
          const date = new Date(entry.joinedAt).toISOString().slice(0, 10);
          joinChartMap[date] = (joinChartMap[date] || 0) + 1;
        }
      }

      totalJoins += eventJoinCount;

      eventBreakdown.push({
        eventId: event._id,
        name: event.name || "Untitled",
        joins: eventJoinCount,
      });
    }

    const joinChart = Object.entries(joinChartMap)
      .map(([date, joins]) => ({ date, joins }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    await redisService.setCache(cacheKey, {totalEvents: events.length, totalJoins, joinChart, eventBreakdown},3600);
    return res.json({
      success: true,
      totalEvents: events.length,
      totalJoins,
      joinChart,
      eventBreakdown,
    });
  } catch (err) {
    console.error("Error fetching event analytics:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


// exports.pricing_interest = async function (req, res) {
//   try {
//     const { email, plan } = req.body;
//     if (!email || !plan) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing fields" });
//     }

//     await PricingInterest.create({ email, plan });
//     return res.json({ success: true, message: "Interest saved" });
//   } catch (err) {
//     console.error("Error saving interest:", err);
//     return res.status(500).json({ success: false, message: "Server error" });
//   }
// };

// exports.fetch_media_type_distribution = async function (req, res) {
//   const user_id = res.locals.verified_user_id;

//   try {
//     const channels = await Channel.find({ user: user_id }, { _id: 1 });
//     const channelIds = channels.map((c) => c._id);

//     if (!channelIds.length) {
//       return res.json({ success: true, media_distribution: [] });
//     }
//     const result = await ChannelChat.aggregate([
//       {
//         $match: { channel: { $in: channelIds }, "media.0": { $exists: true } },
//       },
//       { $unwind: "$media" },
//       {
//         $group: {
//           _id: "$media.type",
//           count: { $sum: 1 },
//         },
//       },
//     ]);

//     const distribution = {
//       image: 0,
//       video: 0,
//       document: 0,
//     };

//     result.forEach((item) => {
//       distribution[item._id] = item.count;
//     });

//     return res.json({ success: true, media_distribution: distribution });
//   } catch (err) {
//     console.error("Error fetching media distribution:", err);
//     return res
//       .status(500)
//       .json({ success: false, message: "Internal server error" });
//   }
// };
