require("dotenv").config();
var mongoose = require("mongoose");
var CommentChip = mongoose.model("CommentChip");
var ChannelChat = mongoose.model("ChannelChat");
var Topic = mongoose.model("Topic");
var Event = mongoose.model("Event");
var User = mongoose.model("User");
var Business = mongoose.model("Business");
var Channel = mongoose.model("Channel");
const chatRabbitmqService = require("../services/chatRabbitmqService");
const rabbitmqService = require("../services/rabbitmqService");
const redisService = require("../services/redisService");

const { v4: uuidv4 } = require("uuid");

const {
  uploadMultipleImages,
  uploadMultipleImagesChips,
  deleteImageFromS3,
  uploadFileToS3,
  uploadMultipleVideos,
  generateThumbnail,
  uploadMultipleFiles,
} = require("../aws/uploads/Images");

const CHAT_TOPIC_PREFIX = "topic_chats:";
const CHATS_PINNED_PREFIX = "topic_chats:pinned:";

const TOPIC_RESOURCE_PREFIX = "topic:resource:";
const TOPIC_REACTION_PREFIX = "topic:reaction:";

const EVENT_PREFIX = "event:";
const TOPIC_EVENT_PREFIX = "topic:event:";
const TOPIC_PREFIX = "topic:";

const POLL_PREFIX = "poll:";
const TOPIC_POLL_PREFIX = "topic:poll:";

const EVENT_SELECT_FIELDS =
  "_id name user joining startDate endDate startTime endTime locationText location paywallPrice cover_image timezone type meet_url createdAt";

exports.create_chat = async function (req, res) {
  const { channel, topic, content, replyTo, links } = req.body;
  const user_id = res.locals.verified_user_id;

  const media_files = JSON.parse(req.body.media);
  const link_files = JSON.parse(links);

  try {
    const topicCacheKey = `${TOPIC_PREFIX}${topic}`;
    let topicData = null;
    topicData = await redisService.getCache(topicCacheKey);
    if (!topicData) {
      topicData = await Topic.findById(topic).select("_id business").lean();
      if (!topicData) {
        return res.json({
          success: false,
          message: "Topic not found",
        });
      }
    }
    const updatedMedia = [];
    if (req.files?.["files"]) {
      const imageFiles = [],
        videoFiles = [],
        docFiles = [];
      const fileMap = [];

      media_files.forEach((mediaItem, index) => {
        const file = req.files["files"][index];
        const { type } = mediaItem;

        if (!file) {
          fileMap.push({ type, file: null });
          return;
        }

        fileMap.push({ type, file });

        if (type === "image") imageFiles.push(file);
        else if (type === "video") videoFiles.push(file);
        else if (type === "document") docFiles.push(file);
      });

      const [imageUploadResults, videoUploadResults, docUploadResults] =
        await Promise.all([
          uploadMultipleImagesChips(imageFiles, "chat_images"),
          uploadMultipleVideos(videoFiles, "chat_videos"),
          uploadMultipleFiles(docFiles, "chat_docs"),
        ]);

      const videoUrls = videoUploadResults.urls || [];
      const videoThumbnails = videoUploadResults.thumbnails || [];

      let imageIndex = 0,
        videoIndex = 0,
        docIndex = 0;

      for (let i = 0; i < fileMap.length; i++) {
        const { type, file } = fileMap[i];
        if (!file) {
          updatedMedia.push(media_files[i]);
          continue;
        }

        let uploadedUrl = "",
          thumbnail = "";

        if (type === "image") {
          uploadedUrl = imageUploadResults[imageIndex++];
        } else if (type === "video") {
          uploadedUrl = videoUrls[videoIndex];
          thumbnail = videoThumbnails[videoIndex];
          videoIndex++;
        } else if (type === "document") {
          uploadedUrl = docUploadResults[docIndex++];
        }

        updatedMedia.push({
          _id: new mongoose.Types.ObjectId(),
          name: file.originalname,
          url: uploadedUrl,
          type,
          thumbnail,
          size: file.size,
        });
      }
    }

    const replyToId =
      replyTo === "null" || replyTo === null
        ? null
        : new mongoose.Types.ObjectId(replyTo);

    const newChat = new ChannelChat({
      user: user_id,
      channel: channel,
      topic: topic,
      content: content,
      media: updatedMedia,
      links: link_files,
      replyTo: replyToId,
      business: topicData.business,
    });
    await newChat.save();

    const updatedChat = await ChannelChat.findById(newChat._id)
      .populate([
        { path: "user", select: "_id username name logo" },
        {
          path: "replyTo",
          select: "content media event poll user",
          populate: {
            path: "user",
            select: "_id username name logo",
          },
        },
      ])
      .exec();
    req.app.get("io").to(topic).emit("receive_message", updatedChat);
    await rabbitmqService.publishInvalidation(
      [`${CHAT_TOPIC_PREFIX}${topic}:latest`],
      "chats"
    );
    return res.json({
      success: true,
      message: "Chat created successfully",
      chat: updatedChat,
    });
  } catch (error) {
    console.error("Error creating chat:", error);
    return res.json({
      success: false,
      message: "Error creating chat",
      error: error.message,
    });
  }
};

exports.fetch_resource_chats = async function (req, res) {
  const { topicId } = req.body;
  const user_id = res.locals.verified_user_id;
  try {
    if (!topicId || !user_id) {
      return res.json({
        success: false,
        message: "Topic ID is required",
      });
    }
    const cacheKey = `${TOPIC_RESOURCE_PREFIX}${topicId}`;
    const cachedChats = await redisService.getCache(cacheKey);
    if (cachedChats) {
      return res.json(cachedChats);
    }
    const chats = await ChannelChat.find({
      topic: topicId,
      media: { $elemMatch: { resource: true } },
    }).populate([
      { path: "user", select: "_id username name logo color_logo" },
    ]);
    const responseData = {
      success: true,
      message: "Chats fetched successfully",
      chats: chats,
    };
    await redisService.setCache(cacheKey, responseData, 3600);
    return res.json(responseData);
  } catch (error) {
    console.error("Error fetching channel chats:", error);
    return res.json({
      success: false,
      message: "Error fetching channel chats",
      error: error.message,
    });
  }
};

exports.delete_topic_chat = async function (req, res) {
  const { id } = req.body;

  try {
    const chat = await ChannelChat.findByIdAndDelete(id);
    if (!chat) {
      return res.json({
        success: false,
        message: "Chat not found",
      });
    }
    const cacheKeys = [`${CHAT_TOPIC_PREFIX}${chat.topic}:latest`];

    if (chat.poll) {
      cacheKeys.push(`${POLL_PREFIX}${chat.poll}`);
      cacheKeys.push(`${TOPIC_POLL_PREFIX}${chat.poll}`);
      await Poll.findByIdAndDelete(chat.poll);
    }
    if (chat.event) {
      cacheKeys.push(`${TOPIC_EVENT_PREFIX}${chat.event}`);
      cacheKeys.push(`${EVENT_PREFIX}${chat.event}`);
      await Event.findByIdAndDelete(chat.event);
    }
    const topicId = chat.topic;
    req.app.get("io").to(topicId).emit("chat_deleted", { topicId, chatId: id });

    await rabbitmqService.publishInvalidation(cacheKeys, "chats");
    return res.json({
      success: true,
      message: "Chat deleted successfully",
      chat: chat,
    });
  } catch (error) {
    console.error("Error deleting channel chat:", error);
    return res.json({
      success: false,
      message: "Error deleting channel chat",
      error: error.message,
    });
  }
};

exports.push_to_resource = async function (req, res) {
  const { chatId, mediaId } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    const chat = await ChannelChat.findOne({ _id: chatId }).populate([
      { path: "user", select: "_id username name logo color_logo" },
    ]);
    if (!chat) {
      return res.json({
        success: false,
        message: "Chat not found",
      });
    }
    const resourceKey = `${TOPIC_RESOURCE_PREFIX}${chat.topic}`;
    const mediaItem = chat.media.find(
      (item) => item._id.toString() === mediaId
    );
    if (!mediaItem) {
      return res.json({
        success: false,
        message: "Media not found in chat",
      });
    }
    mediaItem.resource = true;
    await chat.save();
    await rabbitmqService.publishInvalidation([resourceKey], "chats");

    return res.json({
      success: true,
      message: "Pushed to resources",
      mediaId: mediaId,
      chat: chat,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error pushing to resources",
      error: error.message,
    });
  }
};

exports.remove_from_resource = async function (req, res) {
  const { chatId, mediaId } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    const chat = await ChannelChat.findOne({ _id: chatId });
    if (!chat) {
      return res.json({
        success: false,
        message: "Chat not found",
      });
    }
    const resourceKey = `${TOPIC_RESOURCE_PREFIX}${chat.topic}`;
    const mediaItem = chat.media.find(
      (item) => item._id.toString() === mediaId
    );
    if (!mediaItem) {
      return res.json({
        success: false,
        message: "Media not found in chat",
      });
    }
    mediaItem.resource = false;
    await chat.save();
    await rabbitmqService.publishInvalidation([resourceKey], "chats");
    return res.json({
      success: true,
      message: "Pushed to resources",
      mediaId: mediaId,
      chatId: chatId,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.json({
      success: false,
      message: "Error pushing to resources",
      error: error.message,
    });
  }
};

exports.pin_chat = async function (req, res) {
  const { chatId } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    if (!chatId || !user_id) {
      return res.json({
        success: false,
        message: "Chat ID is required",
      });
    }
    const chat = await ChannelChat.findOne({ _id: chatId });
    if (!chat) {
      return res.json({
        success: false,
        message: "Chat not found",
      });
    }
    const pinKey = `${CHATS_PINNED_PREFIX}${chat.topic}`;
    chat.pinned = chat.pinned ? !chat.pinned : true;
    await chat.save();
    await rabbitmqService.publishInvalidation([pinKey], "chats");
    return res.json({
      success: true,
      message: "Chat pinned successfully",
      chat: chat,
    });
  } catch (error) {
    console.error("Error pinning chat:", error);
    return res.json({
      success: false,
      message: "Error pinning chat",
      error: error.message,
    });
  }
};

exports.unpin_chat = async function (req, res) {
  const { chatId } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    if (!chatId || !user_id) {
      return res.json({
        success: false,
        message: "Chat ID is required",
      });
    }
    const chat = await ChannelChat.findOne({ _id: chatId });
    if (!chat) {
      return res.json({
        success: false,
        message: "Chat not found",
      });
    }
    const pinKey = `${CHATS_PINNED_PREFIX}${chat.topic}`;
    chat.pinned = false;
    await chat.save();
    await rabbitmqService.publishInvalidation([pinKey], "chats");
    return res.json({
      success: true,
      message: "Chat unpinned successfully",
      chatId: chat._id,
    });
  } catch (error) {
    console.error("Error unpinning chat:", error);
    return res.json({
      success: false,
      message: "Error unpinning chat",
      error: error.message,
    });
  }
};

exports.fetch_pinned_chats = async function (req, res) {
  const { topicId } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    if (!topicId || !user_id) {
      return res.json({
        success: false,
        message: "Topic ID is required",
      });
    }
    const pinKey = `${CHATS_PINNED_PREFIX}${topicId}`;
    const cachedPinnedChats = await redisService.getCache(pinKey);
    // if (cachedPinnedChats) {
    //   return res.json({
    //     success: true,
    //     message: "Pinned chats fetched successfully",
    //     chats: cachedPinnedChats,
    //   });
    // }
    const chats = await ChannelChat.find({ topic: topicId, pinned: true })
      .populate([
        { path: "user", select: "_id username name logo color_logo" },
        { path: "event", select: EVENT_SELECT_FIELDS },
      ])
      .lean();
    if (!chats || chats.length === 0) {
      return res.json({
        success: true,
        message: "No pinned chats found",
        chats: [],
      });
    }
    await redisService.setCache(pinKey, chats, 3600);
    return res.json({
      success: true,
      message: "Pinned chats fetched successfully",
      chats: chats,
    });
  } catch (error) {
    console.error("Error fetching pinned chat:", error);
    return res.json({
      success: false,
      message: "Error fetching pinned chats",
      error: error.message,
    });
  }
};

exports.fetch_topic_chats = async function (req, res) {
  const { topicId, limit = 15, skip = 0 } = req.body;
  const user_id = res.locals.verified_user_id;

  if (!topicId || !user_id) {
    return res.json({
      success: false,
      message: "Topic ID is required",
    });
  }

  const parsedLimit = parseInt(limit);
  const parsedSkip = parseInt(skip);
  const useCache = parsedSkip === 0 && parsedLimit === 15;

  const chatCacheKey = `${CHAT_TOPIC_PREFIX}${topicId}:latest`;
  const reactionCacheKey = `${TOPIC_REACTION_PREFIX}${topicId}`;

  try {
    let chatsData = null;
    let reactionsData = null;

    //  if (useCache) {
    //    chatsData = await redisService.getCache(chatCacheKey);
    //  }

    if (!chatsData) {
      const chats = await ChannelChat.find({ topic: topicId })
        .sort({ createdAt: -1 })
        .skip(parsedSkip)
        .limit(parsedLimit)
        .populate([
          { path: "user", select: "_id username name logo color_logo" },
          {
            path: "replyTo",
            select: "content media event poll user",
            populate: {
              path: "user",
              select: "_id username name logo",
            },
          },
          { path: "event", select: EVENT_SELECT_FIELDS },
        ])
        .lean();

      const totalCount = await ChannelChat.countDocuments({ topic: topicId });
      chatsData = {
        chats,
        hasMore: parsedSkip + chats.length < totalCount,
      };

      if (useCache) {
        await redisService.setCache(chatCacheKey, chatsData, 3600);
      }
    }

    if (useCache) {
      reactionsData = await redisService.getCache(reactionCacheKey);
    }

    if (!reactionsData) {
      const chatIds = chatsData.chats.map((chat) => chat._id);

      const reactionsRaw = await ChannelChat.find(
        { _id: { $in: chatIds } },
        { _id: 1, topic: 1, reactions: 1 }
      ).lean();

      reactionsData = reactionsRaw.map((chat) => ({
        _id: chat._id,
        reactions: chat.reactions || [],
      }));

      if (useCache) {
        await redisService.setCache(reactionCacheKey, reactionsData, 60); // 1 min TTL
      }
    }

    return res.status(200).json({
      success: true,
      message: "Chats and reactions fetched successfully",
      chats: chatsData.chats,
      reactions: reactionsData,
      hasMore: chatsData.hasMore,
    });
  } catch (error) {
    console.error("Error fetching chats with reactions:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching chats with reactions",
      error: error.message,
    });
  }
};

exports.toggle_reaction = async function (req, res) {
  const { chatId, reaction } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    const chat = await ChannelChat.findOne({ _id: chatId });
    if (!chat) {
      return res.json({
        success: false,
        message: "Chat not found",
      });
    }
    let reactionToggled = false;
    chat.reactions.forEach((r) => {
      r.users = r.users.filter((id) => id.toString() !== user_id.toString());
    });
    chat.reactions = chat.reactions.filter((r) => r.users.length > 0);
    let existingReaction = chat.reactions.find((r) => r.type === reaction);
    if (existingReaction) {
      existingReaction.users.push(user_id);
      reactionToggled = true;
    } else {
      chat.reactions.push({ type: reaction, users: [user_id] });
    }
    await chat.save();
    await rabbitmqService.publishInvalidation(
      [`${TOPIC_REACTION_PREFIX}${chat.topic}`],
      "chats"
    );
    req.app.get("io").to(chat.topic.toString()).emit("receive_reaction", chat);
    return res.json({
      success: true,
      message: reactionToggled ? "Reaction added" : "Reaction removed",
      chatId: chatId,
      reaction: chat.reactions,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error toggling reaction",
      error: error.message,
    });
  }
};
