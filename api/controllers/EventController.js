require("dotenv").config();
var mongoose = require("mongoose");
var Event = mongoose.model("Event");
var ChannelChat = mongoose.model("ChannelChat");
var Poll = mongoose.model("Poll");
var Event = mongoose.model("Event");
var Topic = mongoose.model("Topic");
var Transaction = mongoose.model("Transaction");
const { uploadSingleImage } = require("../aws/uploads/Images");
const axios = require("axios");
const { DateTime } = require("luxon");


const rabbitmqService = require('../services/rabbitmqService');
const chatRabbitmqService = require('../services/chatRabbitmqService');
const redisService = require('../services/redisService');

const EVENT_PREFIX = 'event:';
const TOPIC_EVENT_PREFIX = 'topic:event:';

const POLL_PREFIX = 'poll:';
const TOPIC_POLL_PREFIX = 'topic:poll:';

const CHAT_TOPIC_PREFIX = 'topic_chats:';


const EVENT_SELECT_FIELDS = "_id name joining startAt expiresAt locationText location paywallPrice paywall cover_image timezone type meet_url createdAt";
const POLL_SELECT_FIELDS = "_id question options showResults multipleChoice createdAt";



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
    paywallPrice,
    paywall,
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
    const cacheKey = `${TOPIC_EVENT_PREFIX}${topic}`;
    const chatCacheKey = `${CHAT_TOPIC_PREFIX}${topic}:latest`;
    if (req.file) {
      imageUrl = await uploadSingleImage(req.file, "event");
    } else if (cover_image) {
      imageUrl = cover_image;
    }
    const topicData = await Topic.findById(topic);
    if (!topicData) {
      return res.json({
        success: false,
        message: "Topic not found",
      });
    }
    let parsedLocation = location
    if (parsedLocation.includes("place_id=")) {
      const placeId = parsedLocation.split("place_id=")[1].split("&")[0];
      const latLng = await getLatLngFromPlaceId(placeId);
      if (latLng) {
        parsedLocation = `https://www.google.com/maps/search/?api=1&query=${latLng.lat},${latLng.lng}`;
      }
    }

    const startAt = DateTime.fromISO(`${startDate}T${startTime}`, { zone: timezone }).toUTC().toJSDate();
    const expiresAt = DateTime.fromISO(`${endDate}T${endTime}`, { zone: timezone }).toUTC().toJSDate();

    const event_data = {
      user: user_id,
      business: topicData.business,
      name,
      description,
      joining,
      startAt,
      expiresAt,
      locationText,
      location:parsedLocation,
      paywallPrice,
      paywall,
      joined_users:[],
      requested_users:[],
      cover_image: imageUrl,
      timezone,
      type,
      meet_url,
    };
    const event = await Event.create(event_data);
    const channelId = topicData.channel;
    const chat_data = {
      user: user_id,
      event: event._id,
      topic,
      channel: channelId,
      business: topicData.business,
    };
    const chat = await ChannelChat.create(chat_data);
    event.chat = chat._id;
    await event.save();
    await chat.populate([
      { path: "user", select: "_id username name" },
      { path: "event", select: EVENT_SELECT_FIELDS }
    ]);
    await rabbitmqService.publishInvalidation(
      [cacheKey,chatCacheKey],
      'event',
    );
   
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
    location,
    cover_image,
    paywallPrice,
    paywall,
    topic,
    timezone,
    type,
    meet_url,
  } = req.body;

  const user_id = res.locals.verified_user_id;
  let imageUrl = null;

  try {
    const topicCacheKey = `${TOPIC_EVENT_PREFIX}${topic}`;
    const chatCacheKey = `${CHAT_TOPIC_PREFIX}${topic}:latest`;
    const cacheKey = `${EVENT_PREFIX}${id}`;
    if (!id) {
      return res.json({
        success: false,
        message: "Event ID is required for updating.",
      });
    }
    const event = await Event.findById(id);
    if (!event || event.user.toString() !== user_id.toString()) {
      return res.json({
        success: false,
        message: "Event not found or you are not the owner of the event.",
      });
    }
    if (req.file) {
      imageUrl = await uploadSingleImage(req.file, "event");
    } else {
      imageUrl = cover_image || event.cover_image;
    }

    let parsedLocation = location
    if (parsedLocation.includes("place_id=")) {
      const placeId = parsedLocation.split("place_id=")[1].split("&")[0];
      const latLng = await getLatLngFromPlaceId(placeId);
      if (latLng) {
        parsedLocation = `https://www.google.com/maps/search/?api=1&query=${latLng.lat},${latLng.lng}`;
      }
    }
    const startAt = DateTime.fromISO(`${startDate}T${startTime}`, { zone: timezone }).toUTC().toJSDate();
    const expiresAt = DateTime.fromISO(`${endDate}T${endTime}`, { zone: timezone }).toUTC().toJSDate();
    const updatedEventData = {
      name,
      description,
      joining,
      startAt,
      expiresAt,
      paywallPrice,
      paywall,
      locationText,
      location:parsedLocation,
      cover_image: imageUrl,
      timezone,
      type,
      meet_url,
    };

    await Event.findByIdAndUpdate(id, updatedEventData, {
      new: true,
    });
    const updatedChat = await ChannelChat.findOne({ _id: event.chat }).populate(
      [
        { path: "user", select: "_id username name" },
        { path: "event", select:EVENT_SELECT_FIELDS },
      ]
    );
    await rabbitmqService.publishInvalidation(
      [topicCacheKey,cacheKey,chatCacheKey],
      'event',
    );
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

exports.fetch_event_data = async function (req, res) {
  const { eventId } = req.body;

  try {
    const cacheKey = `${EVENT_PREFIX}${eventId}`;
    const cachedEvent = await redisService.getCache(cacheKey);
    if (cachedEvent) {
      return res.json(cachedEvent);
    }
    const event = await Event.findById(eventId);
    if (!event) {
      return res.json({ success: false, message: "Event not found." });
    }
    const responseData = {
      success: true,
      message: "Event fetched.",
      event: event,
    };
    await redisService.setCache(cacheKey, responseData, 3600);
    res.json(responseData);
  } catch (error) {
    console.error("Error adding response:", error);
    res.status(500).json({ message: "Error adding response" });
  }
};

exports.fetch_topic_events = async function (req, res) {
  const { topicId } = req.body;
  
  try {
    if(!topicId){
      return res.json({
        success: false,
        message: "Topic ID is required",
      });
    }
      const cacheKey = `${TOPIC_EVENT_PREFIX}${topicId}`;
      const cachedChats = await redisService.getCache(cacheKey);
      if (cachedChats) {
        return res.json(cachedChats);
      }
    const events = await Event.find({ topic: topicId}).populate([
      { path: "user", select: "_id username name logo color_logo" },
    ])
    const responseData = {
      success: true,
      message: "Event chats fetched successfully",
      events:events,
    };
    await redisService.setCache(cacheKey, responseData, 3600);
    return res.json(responseData);
  } catch (error) {
    console.error("Error fetching channel chats:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching channel chats",
      error: error.message,
    });
  }
};

exports.join_event = async function (req, res) {
  const { eventId} = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    const event = await Event.findById(eventId).populate([
      { path: "user", select: "_id username name logo color_logo" },
    ]);
    const cacheKey = `${EVENT_PREFIX}${eventId}`;
    const topicCacheKey = `${TOPIC_EVENT_PREFIX}${event.topic}`;

    if (!event) {
      return res.json({
        success: false,
        message: "Event not found.",
      });
    }
    if(event.paywall && event.paywallPrice > 0){
      const transaction = await Transaction.findOne({ user: user_id, event: eventId });
      if (!transaction) {
        return res.json({ success: false, message: "Transaction not found" });
      }
    }
    const alreadyJoined = event.joined_users.some(u => u.user.toString() === user_id);
    const alreadyRequested = event.requested_users.some(u => u.user.toString() === user_id);

    if (event.joining === "public") {
      if (!alreadyJoined) {
        event.joined_users.push({ user: user_id, joinedAt: new Date() });
      }
    } else {
      if (!alreadyRequested) {
        event.requested_users.push({ user: user_id, requestedAt: new Date() });
      }
    }
    await event.save();
    await rabbitmqService.publishInvalidation(
      [cacheKey, topicCacheKey],
      'event'
    );
    return res.json({
      success: true,
      message: "Event joined sucessfully.",
      event: event,
    });
  } catch (error) {
    res.json({ success: false, message: "Event joining event failed!." });
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
    const cacheKey = `${EVENT_PREFIX}${eventId}`;
    const topicCacheKey = `${TOPIC_EVENT_PREFIX}${event.topic}`;
    const chatCacheKey = `${CHAT_TOPIC_PREFIX}${event.topic}:latest`;
    if (event.chat) {
      await ChannelChat.findOneAndDelete({ _id: event.chat });
    }
    await rabbitmqService.publishInvalidation(
      [cacheKey, topicCacheKey, chatCacheKey],
      'event'
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


exports.create_poll = async function (req, res) {
  const userId = res.locals.verified_user_id;
  const { question, options, topic, type, showResults, multipleChoice } = req.body;
  if (!question || !options || options.length === 0 || !topic) {
    return res.json({
      success: false,
      message: "Question ,topic and options are required!",
    });
  }

  try {
    const topicData = await Topic.findById(topic);
    if (!topicData) {
      return res.json({
        success: false,
        message: "Invalid topic ID provided.",
      });
    }
    const channelId = topicData.channel;
    const newPollChat = new Poll({
      user: userId,
      topic: topic,
      question: question,
      options: options,
      business: topicData.business,
      showResults: showResults,
      multipleChoice: multipleChoice,
      responses: [],
      anonymousResponses: [],
      isClosed: false,
      type: type,
    });
    const cacheKey = `${TOPIC_POLL_PREFIX}${topic}`;
    const chatCacheKey = `${CHAT_TOPIC_PREFIX}${topic}:latest`;

    const savedPollChat = await newPollChat.save();
    const chat_data = {
      user: userId,
      poll: savedPollChat._id,
      topic: topic,
      channel: channelId,
      business: topicData.business,
    };

    const chat = await ChannelChat.create(chat_data);
    savedPollChat.chat = chat._id;
    await savedPollChat.save();
    await chat.populate([
      { path: "user", select: "_id username name" },
      { path: "poll", select: POLL_SELECT_FIELDS }
    ]);
    await rabbitmqService.publishInvalidation(
      [cacheKey,chatCacheKey],
      'poll',
    );
    return res.json({
      success: true,
      message: "Poll created successfully.",
      chat:chat,
    });
  } catch (error) {
    console.error("Error creating poll:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating poll.",
    });
  }
};

exports.fetch_topic_polls = async function (req, res) {
  const { topicId } = req.body;
  
  try {
    if(!topicId){
      return res.json({
        success: false,
        message: "Topic ID is required",
      });
    }
      const cacheKey = `${TOPIC_POLL_PREFIX}${topicId}`;
      const cachedChats = await redisService.getCache(cacheKey);
      if (cachedChats) {
        return res.json(cachedChats);
      }
    const polls = await Poll.find({ topic: topicId}).populate([
      { path: "user", select: "_id username name" },
    ])
    const responseData = {
      success: true,
      message: "Polls fetched successfully",
      polls:polls,
    };
    await redisService.setCache(cacheKey, responseData, 3600);
    return res.json(responseData);
  } catch (error) {
    console.error("Error fetching polls:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching polls",
      error: error.message,
    });
  }
};


exports.make_private_poll_response = async function (req, res) {
  const userId = res.locals.verified_user_id;
  const { choices, pollId } = req.body;
  
  try {
    const poll = await Poll.findById(pollId);
    if (!poll) {
      return res.json({ success: false, message: "Poll not found." });
    }
    const cacheKey = `${POLL_PREFIX}${pollId}`;
    const cachePollKey = `${TOPIC_POLL_PREFIX}${poll.topic}`;
    if (!Array.isArray(choices) || choices.length === 0) {
      return res.json({ success: false, message: "Choices are required." });
    }
    const invalidChoice = choices.find(choice => !poll.options.includes(choice));
    if (invalidChoice) {
      return res.json({ success: false, message: `Invalid choice: ${invalidChoice}` });
    }
    if (!poll.multipleChoice && choices.length > 1) {
      return res.json({ success: false, message: "Multiple choices not allowed in this poll." });
    }
    const existing = poll.responses.find(r => r.user.toString() === userId);
    if (existing) {
      return res.json({ success: false, message: "User has already responded." });
    }
    if(poll.isClosed){
      return res.json({ success: false, message: "Poll is closed." });
    }
    poll.responses.push({ user: userId, choice: choices });
    const poll_data = await poll.save();
    await poll_data.populate([
      { path: "user", select: "_id username name" },
    ]);
    await rabbitmqService.publishInvalidation(
      [cacheKey,cachePollKey],
      'poll',
    );
    res.json({
      success: true,
      message: "Response added to poll.",
      poll: poll_data,
    });
  } catch (error) {
    console.error("Error adding response:", error);
    res.status(500).json({ message: "Error adding response" });
  }
};


exports.make_public_poll_response = async function (req, res) {
  const { choices, pollId,userId } = req.body;
  const ip = req.ip || req.headers["x-forwarded-for"];

  try {
    const poll = await Poll.findById(pollId);
    if (!poll) {
      return res.json({ success: false, message: "Poll not found." });
    }
    const cacheKey = `${POLL_PREFIX}${pollId}`;
    const cachePollKey = `${TOPIC_POLL_PREFIX}${poll.topic}`;

    if (!Array.isArray(choices) || choices.length === 0) {
      return res.json({ success: false, message: "Choices are required." });
    }
    const invalidChoice = choices.find(choice => !poll.options.includes(choice));
    if (invalidChoice) {
      return res.json({ success: false, message: `Invalid choice: ${invalidChoice}` });
    }
    if (!poll.multipleChoice && choices.length > 1) {
      return res.json({ success: false, message: "Multiple choices not allowed." });
    }
    if (userId) {
      const existing = poll.responses.find(r => r.user.toString() === userId);
      if (existing) {
        return res.json({ success: false, message: "User has already responded." });
      }
      poll.responses.push({ user: userId, choice: choices });
    } else {
      const alreadyVoted = poll.anonymousResponses.find(r => r.ip === ip);
      if (alreadyVoted) {
        return res.json({ success: false, message: "Already voted from this IP." });
      }
      poll.anonymousResponses.push({ ip: ip, choice: choices });
    }
    const poll_data = await poll.save();
    await poll_data.populate([
      { path: "user", select: "_id username name" },
    ]);
    await rabbitmqService.publishInvalidation(
      [cacheKey,cachePollKey],
      'poll',
    );
    res.json({
      success: true,
      message: "Anonymous response recorded.",
      poll: poll_data,
    });
  } catch (error) {
    console.error("Error adding anonymous response:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

exports.delete_chat_poll  = async function (req, res) {
  const { pollId } = req.body;
  if (!pollId || !mongoose.Types.ObjectId.isValid(pollId)) {
    return res.json({
      success: false,
      message: "Invalid event ID",
    });
  }
  try {
    const poll = await Poll.findOneAndDelete({ _id: pollId });
    if (!poll) {
      return res.json({
        success: false,
        message: "No event found.",
      });
    }
    const cacheKey = `${POLL_PREFIX}${pollId}`;
    const topicCacheKey = `${TOPIC_POLL_PREFIX}${poll.topic}`;
    const chatCacheKey = `${CHAT_TOPIC_PREFIX}${poll.topic}:latest`;
    if (poll.chat) {
      await ChannelChat.findOneAndDelete({ _id: poll.chat });
    }
    await rabbitmqService.publishInvalidation(
      [cacheKey, topicCacheKey, chatCacheKey],
      'poll'
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
