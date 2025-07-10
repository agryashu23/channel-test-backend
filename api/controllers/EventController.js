require("dotenv").config();
var mongoose = require("mongoose");
var { Types } = require("mongoose");
var Event = mongoose.model("Event");
var ChannelChat = mongoose.model("ChannelChat");
var Poll = mongoose.model("Poll");
var Event = mongoose.model("Event");
var PollVote = mongoose.model("PollVote");
var Topic = mongoose.model("Topic");
var Transaction = mongoose.model("Transaction");
var EventMembership = require("../../db/models/eventMembership");
var TopicMembership = require("../../db/models/topicMembership");
var RedisHelper = require("../../utils/redisHelpers");
const { CachePrefix } = require("../../utils/prefix");

const { uploadSingleImage } = require("../aws/uploads/Images");
const axios = require("axios");
const { DateTime } = require("luxon");

const rabbitmqService = require("../services/rabbitmqService");
const chatRabbitmqService = require("../services/chatRabbitmqService");
const emailRabbitmqService = require("../services/emailRabbitmqService");
const redisService = require("../services/redisService");

const POLL_PREFIX = "poll:";
const TOPIC_POLL_PREFIX = "topic:poll:";

const CHAT_TOPIC_PREFIX = "topic_chats:";

const EVENT_SELECT_FIELDS =
  "_id name user joining startDate endDate startTime endTime locationText visibility location paywallPrice cover_image timezone type meet_url createdAt";
const POLL_SELECT_FIELDS =
  "_id name question choices showResults visibility type createdAt";

async function getLatLngFromPlaceId(placeId) {
  const apiKey = process.env.MAPS_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${apiKey}`;
  try {
    const response = await axios.get(url);
    if (response.data.status === "OK") {
      const location = response.data.result.geometry.location;
      return location;
    } else {
      throw new Error("Place details not found");
    }
  } catch (error) {
    console.error("Error fetching place details:", error);
    throw error;
  }
}

exports.create_chat_event = async function (req, res) {
  const {
    name,
    joining,
    description,
    startDate,
    endDate,
    startTime,
    endTime,
    locationText,
    visibility,
    paywallPrice,
    location,
    cover_image,
    topic,
    timezone,
    type,
    meet_url,
  } = req.body;
  const user_id = res.locals.verified_user_id;
  let imageUrl = null;

  try {
    const chatCacheKey = `${CHAT_TOPIC_PREFIX}${topic}:latest`;
    if (req.file) {
      imageUrl = await uploadSingleImage(req.file, "event");
    } else if (cover_image) {
      imageUrl = cover_image;
    }
    const [topicData, topicMembership] = await Promise.all([
      Topic.findById(topic),
      RedisHelper.getTopicMembership(user_id, topic),
    ]);
    if (!topicData) {
      return res.json({
        success: false,
        message: "Topic not found",
      });
    }
    if (
      !topicMembership ||
      (topicMembership.role !== "admin" && topicMembership.role !== "owner")
    ) {
      return res.json({
        success: false,
        message: "You don't have permission to create event in this topic.",
      });
    }

    if (joining === "paid") {
      const [channel, myPlan] = await Promise.all([
        RedisHelper.getOrCacheChannel(
          topicData.channel,
          `${CachePrefix.CHANNEL_PREFIX}${topicData.channel}`
        ),
        RedisHelper.getBusinessPlan(topicData.business),
      ]);
      if (!myPlan || !myPlan.features?.paidEvents) {
        if (topicData.business) {
          await emailRabbitmqService.sendNotificationMessage({
            type: "admin_notification",
            business: topicData.business,
            buttonText: "",
            buttonLink: `/account/billing`,
            content: `You don't have permission to create paid events in this channel. Upgrade your plan to add more.`,
          });
        }

        return res.json({
          success: true,
          isBusiness: !!topicData.business,
          limitReached: true,
          username: channel?.user?.username,
          message:
            "You don't have permission to create paid events in this channel. Upgrade your plan to add more.",
        });
      }
    }
    let parsedLocation = location;
    if (parsedLocation.includes("place_id=")) {
      const placeId = parsedLocation.split("place_id=")[1].split("&")[0];
      const latLng = await getLatLngFromPlaceId(placeId);
      if (latLng) {
        parsedLocation = `https://www.google.com/maps/search/?api=1&query=${latLng.lat},${latLng.lng}`;
      }
    }

    const event = await Event.create({
      user: user_id,
      business: topicData.business,
      name,
      description,
      joining,
      startDate,
      endDate,
      startTime,
      endTime,
      locationText,
      location: parsedLocation,
      paywallPrice,
      visibility,
      topic,
      joined_users: [],
      requested_users: [],
      cover_image: imageUrl,
      timezone,
      type,
      meet_url,
    });
    const chat = await ChannelChat.create({
      user: user_id,
      event: event._id,
      topic,
      channel: topicData.channel,
      business: topicData.business,
    });

    event.chat = chat._id;
    await event.save();
    await EventMembership.create({
      event: event._id,
      user: user_id,
      topic: topic,
      role: topicMembership.role,
      business: topicData.business,
      status: "joined",
    });
    await emailRabbitmqService.sendEventAdminMembershipJob({
      eventId: event._id,
      topicId: topic,
      creatorId: user_id,
      business: topicData.business || null,
    });
    await chat.populate([
      { path: "user", select: "_id username name logo color_logo" },
      { path: "event", select: EVENT_SELECT_FIELDS },
    ]);
    req.app.get("io").to(topic).emit("receive_message", chat);
    await RedisHelper.addEventToTopic(topic, event);
    await rabbitmqService.publishInvalidation([chatCacheKey], "event");

    return res.json({
      success: true,
      message: "Chat created successfully",
      chat: chat,
    });
  } catch (error) {
    console.error("Error creating event chat:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating event chat",
      error: error.message,
    });
  }
};

exports.edit_chat_event = async function (req, res) {
  const {
    id,
    name,
    joining,
    description,
    startDate,
    endDate,
    startTime,
    endTime,
    locationText,
    visibility,
    location,
    cover_image,
    paywallPrice,
    topic,
    timezone,
    type,
    meet_url,
  } = req.body;

  const user_id = res.locals.verified_user_id;
  let imageUrl = null;

  try {
    const chatCacheKey = `${CHAT_TOPIC_PREFIX}${topic}:latest`;
    const event = await RedisHelper.getOrCacheEvent(id);
    if (!id) {
      return res.json({
        success: false,
        message: "Event ID is required for updating.",
      });
    }
    const [topicData, membership] = await Promise.all([
      Topic.findById(topic),
      RedisHelper.getOrCacheEventMembership(id, user_id),
    ]);
    if (
      !membership ||
      (membership.role !== "admin" && membership.role !== "owner")
    ) {
      return res.json({
        success: false,
        message: "You are not a member of this event.",
      });
    }
    if (req.file) {
      imageUrl = await uploadSingleImage(req.file, "event");
    } else {
      imageUrl = cover_image || event.cover_image;
    }

    if (joining === "paid") {
      const [channel, myPlan] = await Promise.all([
        RedisHelper.getOrCacheChannel(
          topicData.channel,
          `${CachePrefix.CHANNEL_PREFIX}${topicData.channel}`
        ),
        RedisHelper.getBusinessPlan(topicData.business),
      ]);
      if (!myPlan || !myPlan.features?.paidEvents) {
        if (topicData.business) {
          await emailRabbitmqService.sendNotificationMessage({
            type: "admin_notification",
            business: topicData.business,
            buttonText: "",
            buttonLink: `/account/billing`,
            content: `You don't have permission to create paid events in this channel. Upgrade your plan to add more.`,
          });
        }

        return res.json({
          success: true,
          isBusiness: !!topicData.business,
          limitReached: true,
          username: channel?.user?.username,
          message:
            "You don't have permission to create paid events in this channel. Upgrade your plan to add more.",
        });
      }
    }

    let parsedLocation = location;
    if (parsedLocation.includes("place_id=")) {
      const placeId = parsedLocation.split("place_id=")[1].split("&")[0];
      const latLng = await getLatLngFromPlaceId(placeId);
      if (latLng) {
        parsedLocation = `https://www.google.com/maps/search/?api=1&query=${latLng.lat},${latLng.lng}`;
      }
    }

    const updatedEventData = {
      name,
      description,
      joining,
      startDate,
      endDate,
      startTime,
      endTime,
      visibility,
      paywallPrice,
      locationText,
      location: parsedLocation,
      cover_image: imageUrl,
      timezone,
      type,
      meet_url,
    };

    const eventData = await Event.findByIdAndUpdate(id, updatedEventData, {
      new: true,
    });
    const updatedChat = await ChannelChat.findOne({ _id: event.chat }).populate(
      [
        { path: "user", select: "_id username name" },
        { path: "event", select: EVENT_SELECT_FIELDS },
      ]
    );
    await redisService.setCache(
      `${CachePrefix.EVENT_PREFIX}${id}`,
      eventData,
      3600
    );
    await RedisHelper.updateEventInTopic(topic, eventData);
    await rabbitmqService.publishInvalidation([chatCacheKey], "event");
    return res.json({
      success: true,
      message: "Event updated successfully.",
      chat: updatedChat,
    });
  } catch (error) {
    console.error("Error updating event:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating event.",
      error: error.message,
    });
  }
};

exports.fetch_event_memberships = async function (req, res) {
  try {
    const { topicId } = req.body;
    const user_id = res.locals.verified_user_id;

    if (!topicId) {
      return res.json({ success: false, message: "Topic ID is required" });
    }
    const memberships = await RedisHelper.getUserEventMemberships(
      topicId,
      user_id
    );
    return res.json({
      success: true,
      message: "Fetched event memberships for topic",
      memberships: memberships,
    });
  } catch (err) {
    console.error("Error fetching event memberships:", err);
    return res.json({
      success: false,
      message: "Server error while fetching memberships",
      error: err.message,
    });
  }
};

exports.fetch_all_event_members = async function (req, res) {
  try {
    const { eventId } = req.body;
    const user_id = res.locals.verified_user_id;

    if (!eventId) {
      return res.json({ success: false, message: "Event ID is required" });
    }
    const eventMembership = await RedisHelper.getOrCacheEventMembership(
      eventId,
      user_id
    );
    if (
      !eventMembership ||
      (eventMembership.role !== "admin" && eventMembership.role !== "owner")
    ) {
      return res.json({
        success: false,
        message: "You are not a member of this event.",
      });
    }
    const memberships = await RedisHelper.getEventMembers(eventId);
    return res.json({
      success: true,
      message: "Fetched event memberships for topic",
      memberships: memberships,
    });
  } catch (err) {
    console.error("Error fetching event memberships:", err);
    return res.json({
      success: false,
      message: "Server error while fetching memberships",
      error: err.message,
    });
  }
};

exports.fetch_all_event_requests = async function (req, res) {
  try {
    const { eventId } = req.body;
    const user_id = res.locals.verified_user_id;

    if (!eventId) {
      return res.json({ success: false, message: "Event ID is required" });
    }
    const eventMembership = await RedisHelper.getOrCacheEventMembership(
      eventId,
      user_id
    );
    if (
      !eventMembership ||
      (eventMembership.role !== "admin" && eventMembership.role !== "owner")
    ) {
      return res.json({
        success: false,
        message: "You are not a member of this event.",
      });
    }
    const requests = await RedisHelper.getEventRequests(eventId);
    return res.json({
      success: true,
      message: "Fetched event requests for event",
      requests: requests,
    });
  } catch (err) {
    console.error("Error fetching event requests:", err);
    return res.json({
      success: false,
      message: "Server error while fetching requests",
      error: err.message,
    });
  }
};

exports.fetch_event_data = async function (req, res) {
  const { eventId } = req.body;
  if (!eventId) {
    return res.json({
      success: false,
      message: "Event ID is required",
    });
  }
  let user_id = null;

  if (req.body.user_id) {
    user_id = req.body.user_id;
  }

  try {
    const cachedEvent = await RedisHelper.getOrCacheEvent(eventId);
    if (!cachedEvent) {
      return res.json({ success: false, message: "Event not found." });
    }
    if (cachedEvent) {
      let eventMembership = {};
      if (user_id && Types.ObjectId.isValid(user_id)) {
        eventMembership = await RedisHelper.getOrCacheEventMembership(
          eventId,
          user_id
        );
      }
      return res.json({
        success: true,
        message: "Event fetched successfully",
        event: cachedEvent,
        membership: eventMembership,
      });
    }
  } catch (error) {
    console.error("Error adding response:", error);
    res.status(500).json({ message: "Error adding response" });
  }
};

exports.fetch_topic_events = async function (req, res) {
  const { topicId } = req.body;
  const user_id = res.locals.verified_user_id;
  try {
    if (!topicId || !user_id) {
      return res.json({
        success: false,
        message: "Topic ID is required",
      });
    }
    const events = await redisService.getTopicEvents(topicId);
    return res.json({
      success: true,
      message: "Events fetched successfully",
      events: events,
    });
  } catch (error) {
    console.error("Error fetching channel chats:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching channel chats",
      error: error.message,
    });
  }
};

const buildDateTime = (date, time) => {
  if (!date) return null;
  const dateStr = new Date(date).toISOString().split("T")[0];
  if (time && typeof time === "string" && time.trim()) {
    return new Date(`${dateStr}T${time.trim()}Z`); // Ensure time is UTC-safe
  }
  return new Date(date); // Just the date portion
};

exports.join_event = async function (req, res) {
  const { eventId } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    const event = await Event.findById(eventId).populate([
      { path: "user", select: "_id username name logo color_logo" },
    ]);
    if (!event) {
      return res.json({
        success: false,
        message: "Event not found.",
      });
    }
    const [topicMembership, alreadyMember] = await Promise.all([
      RedisHelper.getTopicMembership(event.topic, user_id),
      RedisHelper.getOrCacheEventMembership(eventId, user_id),
    ]);
    if (alreadyMember) {
      if (alreadyMember?.status === "joined") {
        return res.json({
          success: true,
          join: true,
          calendar: true,
          membership: alreadyMember,
          message:
            "You are already a member of this event. Add the event to calendar",
        });
      }
      return res.json({
        success: false,
        message: "Request already sent. Please wait for approval.",
      });
    }
    if (event.visibility === "topic" && !topicMembership) {
      return res.json({
        success: false,
        message:
          "You are not a member of this topic. Please join the topic first.",
      });
    }
    const now = new Date();
    const eventEndDateTime =
      event.endDate || event.endTime
        ? buildDateTime(event.endDate || event.startDate, event.endTime)
        : null;
    if (eventEndDateTime && eventEndDateTime < now) {
      return res.json({ success: false, message: "Event has ended." });
    }
    if (
      event.joining === "paid" &&
      event.paywallPrice > 0 &&
      topicMembership?.role !== "owner" &&
      topicMembership?.role !== "admin"
    ) {
      return res.json({
        success: true,
        message: "This event is paywalled. Please purchase the event to join.",
        paywall: true,
        paywallPrice: event.paywallPrice,
        membership: null,
        event: event,
      });
    }
    let membership = null;
    if (
      event.joining === "public" ||
      topicMembership?.role === "owner" ||
      topicMembership?.role === "admin"
    ) {
      membership = await EventMembership.create({
        event: eventId,
        user: user_id,
        topic: event.topic,
        status: "joined",
        role: topicMembership?.role ? topicMembership?.role : "member",
        business: event.business,
      });
      await Promise.all([
        RedisHelper.addUserEventMembership(event.topic, user_id, membership),
        RedisHelper.addMemberToEvent(event._id, membership),
      ]);
    } else {
      membership = await EventMembership.create({
        event: eventId,
        user: user_id,
        topic: event.topic,
        role: "member",
        status: "request",
        business: event.business,
      });
      const populatedRequest = await EventMembership.findById(membership._id)
        .populate([
          { path: "user", select: "_id name username logo color_logo email" },
          { path: "event", select: "_id name" },
        ])
        .lean();
      await RedisHelper.addRequestToEvent(eventId, populatedRequest);
      if (event.business) {
        await RedisHelper.appendRequestToBusinessArray(
          `${CachePrefix.EVENT_BUSINESS_REQUESTS_PREFIX}${event.business}`,
          populatedRequest,
          3600
        );
      }
    }
    return res.json({
      success: true,
      message: "Event joined sucessfully.",
      membership: membership,
    });
  } catch (error) {
    res.json({
      success: false,
      message: "Event in progress. Please try again.",
    });
  }
};

exports.delete_chat_event = async function (req, res) {
  const { eventId } = req.body;
  if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
    return res.json({
      success: false,
      message: "Invalid event ID",
    });
  }
  try {
    const event = await Event.findOneAndDelete({ _id: eventId });
    if (!event) {
      return res.json({
        success: false,
        message: "No event found.",
      });
    }
    const cacheKey = `${CachePrefix.EVENT_PREFIX}${eventId}`;
    const chatCacheKey = `${CHAT_TOPIC_PREFIX}${event.topic}:latest`;
    const cacheMembersKey = `${CachePrefix.EVENT_MEMBERS_PREFIX}${eventId}`;
    const cacheRequestsKey = `${CachePrefix.EVENT_REQUESTS_PREFIX}${eventId}`;
    if (event.chat) {
      await ChannelChat.findOneAndDelete({ _id: event.chat });
      await EventMembership.deleteMany({ event: eventId });
    }
    await RedisHelper.removeEventFromTopic(event.topic, eventId);
    req.app
      .get("io")
      .to(event.topic)
      .emit("chat_deleted", { topicId: event.topic, chatId: event.chat });
    await rabbitmqService.publishInvalidation(
      [cacheKey, chatCacheKey, cacheMembersKey, cacheRequestsKey],
      "event"
    );
    await RedisHelper.removeEventFromTopic(event.topic, eventId);
    await chatRabbitmqService.publishInvalidation(
      [
        `${CachePrefix.EVENT_TOPIC_MEMBERSHIP_USER_PREFIX}${event.topic}:*`,
        `${CachePrefix.EVENT_MEMBERSHIP_PREFIX}${eventId}:*`,
      ],
      "event",
      "event-invalidation"
    );
    return res.json({
      success: true,
      message: "Event deleted successfully.",
      event: event,
    });
  } catch (error) {
    console.error("Error deleting event:", error);
    return res.json({
      success: false,
      message: "Event deletion failed.",
      error: error.message,
    });
  }
};

exports.accept_event_request = async function (req, res, next) {
  const { eventId, userId, email } = req.body;
  const user_id = res.locals.verified_user_id;
  try {
    const [event, eventMembership] = await Promise.all([
      Event.findById(eventId)
        .select("user _id logo name topic cover_image business")
        .populate([{ path: "user", select: "_id username" }])
        .lean(),
      RedisHelper.getOrCacheEventMembership(eventId, user_id),
    ]);
    if (
      !eventMembership ||
      (eventMembership.role !== "admin" && eventMembership.role !== "owner")
    ) {
      return res.json({
        success: false,
        message: "You don't have permission to accept event request.",
      });
    }

    const membership = await EventMembership.findOneAndUpdate(
      { event: eventId, user: userId, status: "request" },
      { status: "joined" },
      { new: true }
    ).lean();
    await membership.populate([
      { path: "user", select: "_id username name logo color_logo" },
    ]);
    await Promise.all([
      RedisHelper.addMemberToEvent(eventId, membership),
      RedisHelper.updateEventMembershipCache(eventId, userId, membership),
      RedisHelper.updateUserEventMembership(event.topic, userId, membership),
      RedisHelper.removeRequestFromEvent(eventId, userId),
    ]);
    if (event.business) {
      await RedisHelper.removeRequestFromBusinessArray(
        `${CachePrefix.EVENT_BUSINESS_REQUESTS_PREFIX}${event.business}`,
        membership._id
      );
    }
    if (email && email !== "") {
      await emailRabbitmqService.sendEmailMessage({
        to: email,
        channelId: "",
        channelName: "",
        eventId: eventId,
        eventName: event.name,
        username: event.user.username,
        logo:
          event.cover_image ||
          "https://d3i6prk51rh5v9.cloudfront.net/event_cover.png",
        topicId: "",
        topicName: "",
      });
    }
    return res.json({
      success: true,
      message: "Event joined successfully.",
      eventId: eventId,
      userId: userId,
    });
  } catch (error) {
    console.error("Error in joining event:", error);
    return res.status(500).json({
      success: false,
      message: "Error in joining event.",
      error: error.message,
    });
  }
};

exports.decline_event_request = async function (req, res, next) {
  const { eventId, userId } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    const [event, eventMembership] = await Promise.all([
      RedisHelper.getOrCacheEvent(eventId),
      RedisHelper.getOrCacheEventMembership(eventId, user_id),
    ]);
    if (
      !eventMembership ||
      (eventMembership.role !== "admin" && eventMembership.role !== "owner")
    ) {
      return res.json({
        success: false,
        message: "You don't have permission to accept event request.",
      });
    }
    const existingRequest = await EventMembership.findOne({
      event: eventId,
      user: userId,
      status: "request",
    });
    if (existingRequest) {
      await existingRequest.deleteOne();
    }
    await Promise.all([
      RedisHelper.removeUserEventMembership(event.topic, user_id, eventId),
      RedisHelper.removeRequestFromEvent(eventId, userId),
    ]);
    if (event.business) {
      await RedisHelper.removeRequestFromBusinessArray(
        `${CachePrefix.EVENT_BUSINESS_REQUESTS_PREFIX}${event.business}`,
        existingRequest._id
      );
    }
    await rabbitmqService.publishInvalidation(
      [`${CachePrefix.EVENT_MEMBERSHIP_PREFIX}${eventId}:${userId}`],
      "event"
    );
    return res.json({
      success: true,
      message: "Event request declined successfully.",
      eventId: eventId,
      userId: userId,
    });
  } catch (error) {
    console.error("Error in declining event request:", error);
    return res.status(500).json({
      success: false,
      message: "Error in declining event request.",
      error: error.message,
    });
  }
};

exports.create_chat_poll = async function (req, res) {
  const userId = res.locals.verified_user_id;
  const { name, question, choices, topic, type, visibility, showResults } =
    req.body;
  console.log(question, choices, topic);
  if (!question || !choices || choices.length === 0 || !topic) {
    return res.json({
      success: false,
      message: "Question ,topic and options are required!",
    });
  }

  try {
    const [topicData, topicMembership] = await Promise.all([
      Topic.findById(topic),
      RedisHelper.getTopicMembership(userId, topic),
    ]);
    if (!topicData) {
      return res.json({
        success: false,
        message: "Topic not found",
      });
    }
    if (
      !topicMembership ||
      (topicMembership.role !== "admin" && topicMembership.role !== "owner")
    ) {
      return res.json({
        success: false,
        message: "You don't have permission to create event in this topic.",
      });
    }
    const channelId = topicData.channel._id;
    const newPollChat = new Poll({
      user: userId,
      topic: topic,
      question: question,
      choices: choices,
      business: topicData.business,
      showResults: showResults,
      isClosed: false,
      name: name || "Poll",
      type: type,
      visibility: visibility || "anyone",
    });
    const chat = await ChannelChat.create({
      user: userId,
      poll: newPollChat._id,
      topic: topic,
      channel: channelId,
      business: topicData.business,
    });
    newPollChat.chat = chat._id;
    await newPollChat.save();
    await RedisHelper.addPollToTopic(topic, newPollChat);
    const chatCacheKey = `${CHAT_TOPIC_PREFIX}${topic}:latest`;
    await chat.populate([
      { path: "user", select: "_id username name logo color_logo" },
      { path: "poll", select: POLL_SELECT_FIELDS },
    ]);
    req.app.get("io").to(topic).emit("receive_message", chat);
    await rabbitmqService.publishInvalidation([chatCacheKey], "poll");
    return res.json({
      success: true,
      message: "Poll created successfully.",
      chat: chat,
    });
  } catch (error) {
    console.error("Error creating poll:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating poll.",
    });
  }
};

exports.fetch_topic_poll_responses = async function (req, res) {
  const { topicId } = req.body;
  const userId = res.locals.verified_user_id;
  const ip = req.ip || req.headers["x-forwarded-for"];
  console.log(topicId,userId);
  try {
    if (!topicId) {
      return res.json({
        success: false,
        message: "Topic ID is required",
      });
    }
    const polls = await RedisHelper.getOrCacheTopicPolls(topicId);
    if (!polls || polls.length === 0) {
      return res.json({
        success: true,
        responses: [],
        message: "No polls found for this topic.", 
      });
    }

    const pollIds = polls.map((p) => p._id.toString());

    const [voteSummaryMap, voteRecordMap] = await Promise.all([
      RedisHelper.getMultiplePollVoteSummaries(pollIds),
      RedisHelper.getUserPollVoteRecords(pollIds, userId, ip),
    ]);
    const responses = pollIds.map((pollId) => ({
      pollId,
      voteCounts: voteSummaryMap[pollId] || {},
      userResponded: !!voteRecordMap[pollId],
      userChoice: voteRecordMap[pollId],
    }));

    const responseData = {
      success: true,
      message: "Polls responses fetched successfully",
      responses,
    };
    return res.json(responseData);
  } catch (error) {
    console.error("Error fetching poll responses:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching poll responses",
      error: error.message,
    });
  }
};

exports.make_private_poll_response = async function (req, res) {
  const userId = res.locals.verified_user_id;
  const { choice, pollId } = req.body;
  const ip = null;

  try {
    if (!userId || !choice || !pollId) {
      return res.json({
        success: false,
        message: "User ID, choice, and poll ID are required.",
      });
    }
    const cacheKey = `${CachePrefix.POLL_PREFIX}${pollId}`;
    let poll = await redisService.getCache(cacheKey);
    // let poll = null;
    if (!poll) {
      poll = await Poll.findById(pollId);
    }
    console.log(poll);
    if(!poll){
      return res.json({
        success:false,
        message:"Poll no found"
      });
    }
    const invalidChoice = !poll.choices.includes(choice);
    if (invalidChoice) {
      return res.json({
        success: false,
        message: `Invalid choice: ${choice}`,
      });
    }
    if (poll.isClosed) {
      return res.json({ success: false, message: "Poll is closed." });
    }
    const alreadyVotedMap = await RedisHelper.getUserPollVoteRecords(
      [pollId],
      userId,
      ip
    );
    if (alreadyVotedMap[pollId]) {
      return res.json({
        success: false,
        message: "You have already voted in this poll.",
      });
    }
    await PollVote.create({
      poll: poll._id,
      topic: poll.topic,
      user: userId || null,
      ip: ip,
      choice: choice,
    });

    await Promise.all([
      RedisHelper.setUserVoted(pollId, userId, ip, choice),
      RedisHelper.incrementPollChoiceCount(pollId, choice),
    ]);
    const voteCounts = await RedisHelper.getPollVoteSummary(pollId);

    voteCounts[choice] = (parseInt(voteCounts[choice] || 0)).toString();
    const userChoice = choice;

    const response = {
      pollId,
      voteCounts,
      userResponded: true,
      userChoice,
    };
    
    res.json({
      success: true,
      message: "Response added to poll.",
      response:response
    });
  } catch (error) {
    console.error("Error adding response:", error);
    res.status(500).json({ message: "Error adding response" });
  }
};

exports.make_public_poll_response = async function (req, res) {
  const { choice, pollId, userId } = req.body;
  const ip = req.ip || req.headers["x-forwarded-for"];
  console.log(userId,ip);
  if (!pollId || !choice) {
    return res.json({
      success: false,
      message: "Poll ID and choice are required.",
    });
  }
  if (!userId && !ip) {
    return res.json({ success: false, message: "User ID or IP is required." });
  }

  try {
    const poll = await Poll.findById(pollId);
    if (!poll || poll.isClosed) {
      return res.json({
        success: false,
        message: "Poll not found or is closed.",
      });
    }

    if (!poll.choices.includes(choice)) {
      return res.json({ success: false, message: "Invalid choice." });
    }

    const alreadyVoted = await RedisHelper.hasVoted(pollId, userId, ip);
    if (alreadyVoted) {
      return res.json({ success: false, message: "Already voted." });
    }
    await PollVote.create({
      poll: poll._id,
      topic: poll.topic,
      user: userId || null,
      ip: userId ? null : ip,
      choice,
    });
    await Promise.all([
      RedisHelper.setUserVoted(pollId, userId, ip, choice),
      RedisHelper.incrementPollChoiceCount(pollId, choice),
    ]);
    const voteCounts = await RedisHelper.getPollVoteSummary(pollId);

    voteCounts[choice] = (parseInt(voteCounts[choice] || 0)).toString();
    const userChoice = choice;

    const response = {
      pollId,
      voteCounts,
      userResponded: true,
      userChoice,
    };

    return res.json({
      success: true,
      message: "Vote recorded successfully.",
      response:response
    });
  } catch (error) {
    console.error("Error in public poll vote:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

exports.fetch_poll_data = async function (req, res) {
  const { pollId, userId } = req.body;
  const ip = req.ip || req.headers["x-forwarded-for"];
  if (!pollId || !mongoose.Types.ObjectId.isValid(pollId)) {
    return res.json({
      success: false,
      message: "Invalid poll ID",
    });
  }
  try {
    const cacheKey = `${CachePrefix.POLL_PREFIX}${pollId}`;
    let poll = await redisService.getCache(cacheKey);
    if (!poll) {
      poll = await Poll.findById(pollId).lean();
    }
    let isAdmin = false;
    let isTopicMembership = false;
    if(userId){
      const membership = await TopicMembership.findOne({
        topic:poll.topic, 
        user:userId,
        status:"joined",
      });
      if(membership && (membership.role==="admin" || membership.role==="owner")){
        isAdmin=true;
      }
      if(membership){
        isTopicMembership = true;
      }
    }
    const voteCounts = await RedisHelper.getPollVoteSummary(pollId);
    const userChoice = await RedisHelper.hasVoted(pollId, userId, ip);
    const userResponded = !!userChoice;

    const response = {
      pollId,
      voteCounts,
      userResponded,
      userChoice,
    };
    res.json({
      success: true,
      response,
      poll: { ...poll, isAdmin , isTopicMembership }
    });
  } catch (error) {
    console.error("Error fetching poll data:", error);
    res.status(500).json({ message: "Error fetching poll data" });
  }
};

exports.delete_chat_poll = async function (req, res) {
  const { pollId } = req.body;
  if (!pollId || !mongoose.Types.ObjectId.isValid(pollId)) {
    return res.json({
      success: false,
      message: "Invalid event ID",
    });
  }
  try {
    const cacheKey = `${CachePrefix.POLL_PREFIX}${pollId}`;
    let poll = await redisService.getCache(cacheKey);
    if (!poll) {
      poll = await Poll.findById(pollId);
    }
    await Promise.all([
      Poll.findOneAndDelete({ _id: pollId }),
      PollVote.deleteMany({ poll: pollId }),
      RedisHelper.removePollFromTopic(poll.topic, pollId),
    ]);
    const pollVotecountkey = `${CachePrefix.POLL_VOTE_COUNTS_PREFIX}${pollId}`;
    const chatCacheKey = `${CachePrefix.CHAT_TOPIC_PREFIX}${poll.topic}:latest`;
    if (poll.chat) {
      await ChannelChat.findOneAndDelete({ _id: poll.chat });
    }
     req.app
      .get("io")
      .to(poll.topic)
      .emit("chat_deleted", { topicId: poll.topic, chatId: poll.chat });
    await rabbitmqService.publishInvalidation(
      [cacheKey, chatCacheKey, pollVotecountkey],
      "poll"
    );
    await chatRabbitmqService.publishInvalidation(
      [`${CachePrefix.POLL_USER_VOTE_PREFIX}${pollId}:*`],
      "poll",
      "poll-invalidation"
    );
    return res.json({
      success: true,
      message: "Poll deleted successfully.",
      poll: poll,
    });
  } catch (error) {
    console.error("Error deleting poll:", error);
    return res.json({
      success: false,
      message: "Poll deletion failed.",
      error: error.message,
    });
  }
};
