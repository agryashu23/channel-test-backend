require("dotenv").config();
const { Polly } = require("aws-sdk");
var mongoose = require("mongoose");
const ChannelMembership = mongoose.model("ChannelMembership");
const TopicMembership = mongoose.model("TopicMembership");
const Channel = mongoose.model("Channel");
const Topic = mongoose.model("Topic");
const User = mongoose.model("User");
const Poll = mongoose.model("Poll");
const Event = mongoose.model("Event");
const ChannelChat = mongoose.model("ChannelChat");

const CHANNELS_MEMBERS_PREFIX = "channels:members:";
const TOPICS_MEMBERS_PREFIX = "topics:members:";

async function linkUserMemberships(user) {
  const email = user.email;
  const userId = user._id;
  const [channelRes, topicRes] = await Promise.allSettled([
    ChannelMembership.find({ email, user: null }).select("channel").lean(),
    TopicMembership.find({ email, user: null }).select("topic").lean(),
  ]);

  const channelMemberships =
    channelRes.status === "fulfilled" ? channelRes.value : [];
  const topicMemberships =
    topicRes.status === "fulfilled" ? topicRes.value : [];

  const channelIds = channelMemberships.map((m) => String(m.channel));
  const topicIds = topicMemberships.map((m) => String(m.topic));
  await Promise.allSettled([
    channelIds.length
      ? ChannelMembership.updateMany(
          { email, user: null },
          { $set: { user: userId, status: "joined" } }
        )
      : null,
    topicIds.length
      ? TopicMembership.updateMany(
          { email, user: null },
          { $set: { user: userId, status: "joined" } }
        )
      : null,
  ]);
  const cacheKeys = [
    ...channelIds.map((cid) => `${CHANNELS_MEMBERS_PREFIX}${cid}`),
    ...topicIds.map((tid) => `${TOPICS_MEMBERS_PREFIX}${tid}`),
  ];
  return cacheKeys;
}

async function syncMembershipsFromAdmin({
  business,
  email,
  channelName,
  topicNames,
}) {
  if (!email || !channelName || !business) return [];

  topicNames = Array.isArray(topicNames) ? topicNames : [];

  const cacheKeys = [];

  const channel = await Channel.findOne({ name: channelName }).populate({
    path: "topics",
    select: "_id name",
  });

  if (!channel) return [];

  const channelId = channel._id;

  const filteredTopics = (channel.topics || []).filter(
    (t) => topicNames.length === 0 || topicNames.includes(t.name)
  );
  const topicIds = filteredTopics.map((t) => t._id);

  let channelMembership = await ChannelMembership.findOne({
    email,
    business,
    channel: channelId,
  });

  let membershipChanged = false;

  if (channelMembership) {
    if (channelMembership.user && channelMembership.status !== "joined") {
      await ChannelMembership.updateOne(
        { _id: channelMembership._id },
        { $set: { status: "joined" } }
      );
      membershipChanged = true;
    }
  } else {
    channelMembership = await ChannelMembership.create({
      email,
      channel: channelId,
      business,
      status: "processing",
    });
    membershipChanged = true;
  }

  if (topicIds.length > 0) {
    const existingTopicMemberships = await TopicMembership.find({
      email,
      topic: { $in: topicIds },
    });

    const existingTopicMap = new Map();
    for (const m of existingTopicMemberships) {
      existingTopicMap.set(m.topic.toString(), m);
    }

    const bulkOps = [];

    for (const topic of filteredTopics) {
      const topicId = topic._id;
      const existing = existingTopicMap.get(topicId.toString());

      if (existing) {
        if (existing.user && existing.status !== "joined") {
          bulkOps.push({
            updateOne: {
              filter: { _id: existing._id },
              update: { $set: { status: "joined" } },
            },
          });
        }
      } else {
        bulkOps.push({
          insertOne: {
            document: {
              email,
              topic: topicId,
              channel: channelId,
              business,
              status: "processing",
            },
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      await TopicMembership.bulkWrite(bulkOps);
    }
  }
  return cacheKeys;
}

function preprocessMembershipRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const rawEmail = row.email || "";
    const rawChannel = row.channelName || "";
    const email = rawEmail.trim().toLowerCase();
    const channelName = rawChannel.trim();
    const topicNames = Array.isArray(row.topicNames) ? row.topicNames : [];
    if (!email || !channelName) {
      continue;
    }
    const key = `${email}::${channelName}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        email,
        channelName,
        topicNames: new Set(topicNames),
      });
    } else {
      const existing = grouped.get(key);
      topicNames.forEach((name) => existing.topicNames.add(name));
    }
  }
  const validRows = Array.from(grouped.values()).map((entry) => ({
    email: entry.email,
    channelName: entry.channelName,
    topicNames: Array.from(entry.topicNames),
  }));

  return validRows;
}

async function syncMembershipsFromAdminInitial({
  business,
  email,
  channelName,
  topicNames = [],
  channelCache = new Map(),
  topicCache = new Map(),
}) {
  const cacheKeys = [];
  let channel = channelCache.get(channelName);
  if (!channel) {
    channel = await Channel.findOne({ name: channelName });
    if (!channel)
      return { cacheKeys, skipped: true, reason: "Channel not found" };
    channelCache.set(channelName, channel);
  }
  const channelId = channel._id;

  let filteredTopics = [];
  if (topicNames.length > 0) {
    const uncachedTopicNames = topicNames.filter(
      (name) => !topicCache.has(`${channelName}:${name}`)
    );
    if (uncachedTopicNames.length > 0) {
      const foundTopics = await Topic.find({
        name: { $in: uncachedTopicNames },
      });
      for (const topic of foundTopics) {
        if (topic.channel.toString() === channelId.toString()) {
          topicCache.set(`${channelName}:${topic.name}`, topic);
        }
      }
    }
    filteredTopics = topicNames
      .map((name) => topicCache.get(`${channelName}:${name}`))
      .filter(Boolean);
  }

  const topicIds = filteredTopics.map((t) => t._id);

  const [existingChannelMembership, existingTopicMemberships] =
    await Promise.all([
      ChannelMembership.findOne({ email, business, channel: channelId }),
      topicIds.length > 0
        ? TopicMembership.find({ email, topic: { $in: topicIds } })
        : Promise.resolve([]),
    ]);

  const channelOps = [];
  if (existingChannelMembership) {
    if (
      existingChannelMembership.user &&
      existingChannelMembership.status !== "joined"
    ) {
      channelOps.push(
        ChannelMembership.updateOne(
          { _id: existingChannelMembership._id },
          { $set: { status: "joined", business } }
        )
      );
    }
  } else {
    channelOps.push(
      ChannelMembership.create({
        email,
        channel: channelId,
        business,
        status: "processing",
      })
    );
  }

  const existingTopicMap = new Map();
  for (const m of existingTopicMemberships) {
    existingTopicMap.set(m.topic.toString(), m);
  }

  const topicCreates = [];
  const topicUpdates = [];

  for (const topic of filteredTopics) {
    const topicId = topic._id;
    const existing = existingTopicMap.get(topicId.toString());

    if (existing) {
      if (existing.user && existing.status !== "joined") {
        topicUpdates.push({
          updateOne: {
            filter: { _id: existing._id },
            update: { $set: { status: "joined", business } },
          },
        });
      }
    } else {
      topicCreates.push({
        email,
        topic: topicId,
        channel: channelId,
        business,
        status: "processing",
      });
    }
  }
  await Promise.all(
    [
      ...channelOps,
      topicCreates.length > 0 ? TopicMembership.insertMany(topicCreates) : null,
      topicUpdates.length > 0 ? TopicMembership.bulkWrite(topicUpdates) : null,
    ].filter(Boolean)
  );

  return cacheKeys;
}

async function shiftUserToBusiness(user_id, business_id) {
  const user = await User.findByIdAndUpdate(
    user_id,
    { business: business_id },
    { new: true }
  ).select("email");

  const [channels, topics] = await Promise.all([
    Channel.find({ user: user_id }).select("_id").lean(),
    Topic.find({ user: user_id }).select("_id").lean(),
  ]);
  const channelIds = channels.map((c) => c._id);
  const topicIds = topics.map((t) => t._id);
  await Promise.all([
    Channel.updateMany(
      { _id: { $in: channelIds } },
      { $set: { business: business_id } }
    ),
    Topic.updateMany(
      { _id: { $in: topicIds } },
      { $set: { business: business_id } }
    ),
    ChannelMembership.updateMany(
      { channel: { $in: channelIds } },
      { $set: { business: business_id } }
    ),
    TopicMembership.updateMany(
      {
        channel: { $in: channelIds },
        topic: { $in: topicIds },
      },
      { $set: { business: business_id } }
    ),
    ChannelChat.updateMany(
      { topic: { $in: topicIds } },
      { $set: { business: business_id } }
    ),
    Poll.updateMany({ user: user_id }, { $set: { business: business_id } }),
    Event.updateMany({ user: user_id }, { $set: { business: business_id } }),
  ]);

  return {
    success: true,
    message: "User and all related entities shifted to business.",
    stats: {
      user: user.email,
      channels: channelIds.length,
      topics: topicIds.length,
    },
  };
}

module.exports = {
  linkUserMemberships,
  syncMembershipsFromAdmin,
  preprocessMembershipRows,
  syncMembershipsFromAdminInitial,
  shiftUserToBusiness,
};
