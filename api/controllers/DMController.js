require("dotenv").config();
var mongoose = require("mongoose");
var User = mongoose.model("User");
var DMRoom = mongoose.model("DMRoom");
var DMChat = mongoose.model("DMChat");
var Business = mongoose.model("Business");
const rabbitmqService = require("../services/rabbitmqService");
const redisService = require("../services/redisService");
const {
  uploadMultipleImagesChips,
  uploadMultipleVideos,
  uploadMultipleFiles,
} = require("../aws/uploads/Images");
const DM_INBOX_PREFIX = "dm:inbox:";
const DM_CHAT_PREFIX = "dm:chat:";

exports.get_inbox_messages = async (req, res) => {
  const userId = res.locals.verified_user_id;

  try {
    const cacheKey = `${DM_INBOX_PREFIX}${userId}`;
    const cachedInbox = await redisService.getCache(cacheKey);
    if (cachedInbox) {
      return res.json({
        success: true,
        message: "Inbox fetched successfully.",
        messages: cachedInbox,
      });
    }
    const rooms = await DMRoom.find({ users: userId })
      .populate({
        path: "lastMessage",
        select: "sender content createdAt readBy media",
      })
      .populate({
        path: "users",
        select: "_id username logo color_logo",
      })
      .sort({ updatedAt: -1 });

    const inbox = await Promise.all(
      rooms.map(async (room) => {
        const validUsers = room.users.filter(Boolean);
        const otherUser = validUsers.find((u) => u._id.toString() !== userId);

        if (!otherUser) return null;
        const unreadCount = await DMChat.countDocuments({
          dmRoom: room._id,
          sender: otherUser._id,
          readBy: { $ne: userId },
        });

        return {
          roomId: room._id,
          otherUser: {
            _id: otherUser._id,
            username: otherUser.username,
            logo: otherUser.logo,
            color_logo: otherUser.color_logo,
          },
          lastMessage: {
            content: room.lastMessage?.content || "",
            sender: room.lastMessage?.sender,
            createdAt: room.lastMessage?.createdAt,
          },
          unread: unreadCount,
        };
      })
    );
    await redisService.setCache(cacheKey, inbox.filter(Boolean), 3600);

    res.json({
      success: true,
      messages: inbox.filter(Boolean),
      message: "Messages fetched successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.create_dm_chat = async function (req, res) {
  const sender = res.locals.verified_user_id;
  const { receiver, content, replyTo, links } = req.body;
  if (!receiver) {
    return res.json({
      success: false,
      message: "Receiver is required",
    });
  }

  const media_files = JSON.parse(req.body.media || "[]");
  const link_files = JSON.parse(links || "[]");

  try {
    const cacheKeys = [];
    const cacheKey = `${DM_INBOX_PREFIX}${sender}`;
    const cacheKey2 = `${DM_INBOX_PREFIX}${receiver}`;

    const cacheDmKey = `${DM_CHAT_PREFIX}${sender}:${receiver}`;
    const cacheDmKey2 = `${DM_CHAT_PREFIX}${receiver}:${sender}`;

    let room = await DMRoom.findOne({ users: { $all: [sender, receiver] } });
    if (!room) {
      room = await DMRoom.create({
        users: [sender, receiver],
        lastSeen: {
          [sender]: new Date(),
          [receiver]: null,
        },
      });
      cacheKeys.push(cacheKey);
      cacheKeys.push(cacheKey2);
    }

    const updatedMedia = [];

    if (req.files?.files) {
      for (let i = 0; i < media_files.length; i++) {
        const mediaItem = media_files[i];
        const file = req.files["files"][i];

        if (!file) {
          updatedMedia.push(mediaItem);
          continue;
        }

        let uploadedUrl = "";
        let thumbnail = "";
        const { type } = mediaItem;

        if (type === "image") {
          const [imageUrl] = await uploadMultipleImagesChips(
            [file],
            "dm_images"
          );
          uploadedUrl = imageUrl;
        } else if (type === "video") {
          const { urls, thumbnails } = await uploadMultipleVideos(
            [file],
            "dm_videos"
          );
          uploadedUrl = urls[0];
          thumbnail = thumbnails[0];
        } else if (type === "document") {
          const [docUrl] = await uploadMultipleFiles([file], "dm_docs");
          uploadedUrl = docUrl;
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

    const newMessage = await DMChat.create({
      dmRoom: room._id,
      sender,
      content,
      media: updatedMedia,
      links: link_files,
      replyTo: replyToId,
      readBy: [sender],
    });

    room.lastMessage = newMessage._id;
    await room.save();

    const populatedMessage = await DMChat.findById(newMessage._id)
      .populate({ path: "sender", select: "_id username name logo color_logo" })
      .populate({
        path: "replyTo",
        select: "content media",
        populate: {
          path: "sender",
          select: "_id username name logo color_logo",
        },
      });

    const receiverUser = await User.findById(receiver);

    if (receiverUser) {
      req.app
        .get("io")
        .to(receiver.toString())
        .emit("dm_message", populatedMessage);
    }
    cacheKeys.push(cacheDmKey);
    cacheKeys.push(cacheDmKey2);

    await rabbitmqService.publishInvalidation(cacheKeys, "dm");
    res.json({
      success: true,
      message: "Message sent successfully",
      chat: populatedMessage,
    });
  } catch (error) {
    console.error("Error sending DM:", error);
    return res.status(500).json({
      success: false,
      message: "Error sending DM",
      error: error.message,
    });
  }
};
exports.create_brand_chat = async function (req, res) {
  const sender = res.locals.verified_user_id;
  const { username, content, replyTo, links } = req.body;

  const media_files = JSON.parse(req.body.media || "[]");
  const link_files = JSON.parse(links || "[]");

  try {
    const receiverData = await User.findOne({ username: username });
    if (!receiverData) {
      return res.json({
        success: false,
        message: "User not found",
      });
    }

    const receiver = receiverData._id;
    const cacheKey = `${DM_INBOX_PREFIX}${sender}`;
    const cacheDmKey = `${DM_CHAT_PREFIX}${sender}:${receiver}`;
    const cacheDmKey2 = `${DM_CHAT_PREFIX}${receiver}:${sender}`;

    let room = await DMRoom.findOne({ users: { $all: [sender, receiver] } });
    if (!room) {
      room = await DMRoom.create({
        users: [sender, receiver],
        lastSeen: {
          [sender]: new Date(),
          [receiver]: null,
        },
      });
      await rabbitmqService.publishInvalidation([cacheKey], "dm");
    }

    const updatedMedia = [];
    if (req.files?.files) {
      for (let i = 0; i < media_files.length; i++) {
        const mediaItem = media_files[i];
        const file = req.files["files"][i];

        if (!file) {
          updatedMedia.push(mediaItem);
          continue;
        }

        let uploadedUrl = "";
        let thumbnail = "";
        const { type } = mediaItem;

        if (type === "image") {
          const [imageUrl] = await uploadMultipleImagesChips(
            [file],
            "dm_images"
          );
          uploadedUrl = imageUrl;
        } else if (type === "video") {
          const { urls, thumbnails } = await uploadMultipleVideos(
            [file],
            "dm_videos"
          );
          uploadedUrl = urls[0];
          thumbnail = thumbnails[0];
        } else if (type === "document") {
          const [docUrl] = await uploadMultipleFiles([file], "dm_docs");
          uploadedUrl = docUrl;
        }

        updatedMedia.push({
          id: uuidv4(),
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

    const newMessage = await DMChat.create({
      dmRoom: room._id,
      sender,
      content,
      media: updatedMedia,
      links: link_files,
      replyTo: replyToId,
      chatType: "brand",
      readBy: [sender],
    });

    room.lastMessage = newMessage._id;
    await room.save();

    const populatedMessage = await DMChat.findById(newMessage._id)
      .populate({ path: "sender", select: "_id username name logo color_logo" })
      .populate({
        path: "replyTo",
        select: "content media",
        populate: {
          path: "sender",
          select: "_id username name logo color_logo",
        },
      });

    const receiverUser = await User.findById(receiver);

    if (receiverUser) {
      req.app
        .get("io")
        .to(receiver.toString())
        .emit("dm_message", populatedMessage);
    }

    await rabbitmqService.publishInvalidation([cacheDmKey, cacheDmKey2], "dm");
    res.json({
      success: true,
      message: "Message sent successfully",
      chat: populatedMessage,
    });
  } catch (error) {
    console.error("Error sending DM:", error);
    return res.status(500).json({
      success: false,
      message: "Error sending DM",
      error: error.message,
    });
  }
};

// exports.create_brand_chat = async function (req, res) {
//   const { domain, content, replyTo, links } = req.body;
//   const user_id = res.locals.verified_user_id;

//   const media_files = JSON.parse(req.body.media);
//   const link_files = JSON.parse(links);

//   try {
//     const updatedMedia = [];

//     if (req.files["files"]) {
//       for (let index = 0; index < media_files.length; index++) {
//         const mediaItem = media_files[index];
//         const file = req.files["files"][index];

//         if (!file) {
//           updatedMedia.push(mediaItem);
//           continue;
//         }

//         let uploadedUrl = "";
//         let thumbnail = "";
//         const { type } = mediaItem;
//         if (type === "image") {
//           const [imageUrl] = await uploadMultipleImagesChips(
//             [file],
//             "chat_images"
//           );
//           uploadedUrl = imageUrl;
//         } else if (type === "video") {
//           const { urls: videoUrls, thumbnails: videoThumbnails } =
//             await uploadMultipleVideos([file], "chat_videos");
//           uploadedUrl = videoUrls[0];
//           thumbnail = videoThumbnails[0];
//         } else if (type === "document") {
//           const [docUrl] = await uploadMultipleFiles([file], "chat_docs");
//           uploadedUrl = docUrl;
//         }
//         updatedMedia.push({
//           id: uuidv4(),
//           name: file.originalname,
//           url: uploadedUrl,
//           type: type,
//           thumbnail: thumbnail,
//           size: file.size,
//         });
//       }
//     }

//     const replyToId =
//       replyTo === "null" || replyTo === null
//         ? null
//         : new mongoose.Types.ObjectId(replyTo);
//     const business = await Business.findOne({ domain: domain });
//     const newChat = new Chat({
//       user: user_id,
//       brand_user: business.user_id,
//       content: content,
//       media: updatedMedia,
//       links: link_files,
//       replyTo: replyToId,
//       poll: {},
//     });

//     await newChat.save();

//     const updatedChat = await Chat.findById(newChat._id)
//       .populate([
//         { path: "user", select: "_id username name logo" },
//         {
//           path: "replyTo",
//           select: "content media event poll",
//           populate: {
//             path: "user",
//             select: "_id username name logo",
//           },
//         },
//       ])
//       .exec();

//     return res.json({
//       success: true,
//       message: "Brand Chat created successfully",
//       chat: updatedChat,
//     });
//   } catch (error) {
//     console.error("Error creating brand chat:", error);
//     return res.json({
//       success: false,
//       message: "Error creating brand chat",
//       error: error.message,
//     });
//   }
// };

exports.fetch_dm_chats = async function (req, res) {
  const { receiverUsername } = req.body;
  const sender = res.locals.verified_user_id;

  if (!sender || !receiverUsername) {
    return res.json({ success: false, message: "Missing sender or receiver" });
  }
  const receiver = await User.findOne({ username: receiverUsername }).lean();

  try {
    const cacheKey = `${DM_CHAT_PREFIX}${sender}:${receiver._id}`;
    const cacheKey2 = `${DM_CHAT_PREFIX}${receiver._id}:${sender}`;
    const cachedChat = await redisService.getCache(cacheKey);
    const cachedChat2 = await redisService.getCache(cacheKey2);
    if (cachedChat || cachedChat2) {
      return res.json({
        success: true,
        message: "Chat fetched successfully.",
        chats: cachedChat || cachedChat2,
      });
    }
    const room = await DMRoom.findOne({
      users: { $all: [sender, receiver._id] },
    });

    if (!room) {
      return res.status(200).json({
        success: true,
        message: "No conversation found",
        chats: [],
      });
    }

    const messages = await DMChat.find({ dmRoom: room._id })
      .sort({ createdAt: 1 })
      .populate({ path: "sender", select: "_id username name logo color_logo" })
      .populate({
        path: "replyTo",
        select: "content media",
        populate: {
          path: "sender",
          select: "_id username name logo color_logo",
        },
      })
      .lean();

    await DMChat.updateMany(
      {
        dmRoom: room._id,
        sender: { $ne: sender },
        readBy: { $ne: sender },
      },
      { $push: { readBy: sender } }
    );

    room.lastSeen.set(sender, new Date());
    await room.save();
    await redisService.setCache(cacheKey, messages, 3600);
    await redisService.setCache(cacheKey2, messages, 3600);
    res.json({
      success: true,
      message: "Messages fetched successfully",
      chats: messages,
    });
  } catch (err) {
    console.error("Error fetching DM messages:", err);
    res.json({ success: false, message: "Server error", error: err.message });
  }
};
exports.fetch_brand_chats = async function (req, res) {
  const { user_id } = req.body;
  const sender = res.locals.verified_user_id;

  if (!sender) {
    return res.json({ success: false, message: "Missing sender " });
  }

  try {
    const receiver = user_id;
    console.log(receiver);
    console.log(sender);
    const cacheKey = `${DM_CHAT_PREFIX}${sender}:${receiver}`;
    const cacheKey2 = `${DM_CHAT_PREFIX}${receiver}:${sender}`;
    const cachedChat = await redisService.getCache(cacheKey);
    const cachedChat2 = await redisService.getCache(cacheKey2);
    if (cachedChat || cachedChat2) {
      return res.json({
        success: true,
        message: "Chat fetched successfully.",
        chats: cachedChat || cachedChat2,
      });
    }

    const room = await DMRoom.findOne({
      users: { $all: [sender, receiver] },
    });

    if (!room) {
      return res.status(200).json({
        success: true,
        message: "No conversation found",
        chats: [],
      });
    }

    const messages = await DMChat.find({ dmRoom: room._id })
      .sort({ createdAt: 1 })
      .populate({ path: "sender", select: "_id username name logo color_logo" })
      .populate({
        path: "replyTo",
        select: "content media",
        populate: {
          path: "sender",
          select: "_id username name logo color_logo",
        },
      })
      .lean();

    await DMChat.updateMany(
      {
        dmRoom: room._id,
        sender: { $ne: sender },
        readBy: { $ne: sender },
      },
      { $push: { readBy: sender } }
    );

    room.lastSeen.set(sender, new Date());
    await room.save();
    await redisService.setCache(cacheKey, messages, 3600);
    await redisService.setCache(cacheKey2, messages, 3600);
    res.json({
      success: true,
      message: "Messages fetched successfully",
      chats: messages,
    });
  } catch (err) {
    console.error("Error fetching DM messages:", err);
    res.json({ success: false, message: "Server error", error: err.message });
  }
};

// exports.fetch_brand_chats = async function (req, res) {
//   try {
//     const business = await Business.findOne({ domain: domain });
//     if (!business) {
//       return res.json({
//         success: false,
//         message: "Brand doesn't exist",
//       });
//     }
//     const brandUser = business.user_id;
//     const chats = await Chat.find({
//       user: user_id,
//       brand_user: brandUser,
//     }).populate({ path: "user", select: "_id username name logo color_logo" });
//     return res.json({
//       success: true,
//       message: "Chats fetched successfully",
//       chats: chats,
//     });

//     return res.json({
//       success: true,
//       message: "Chats fetched successfully",
//     });
//   } catch (error) {
//     console.error("Error fetching chats:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error fetching chats",
//       error: error.message,
//     });
//   }
// };

async function getOtherUserInRoom(roomId, currentUserId) {
  const room = await DMRoom.findById(roomId);

  if (!room) return null;

  const otherUser = room.users.find(
    (u) => u.toString() !== currentUserId.toString()
  );

  return otherUser;
}
exports.toggle_dm_reaction = async function (req, res) {
  const { chatId, reaction } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    const chat = await DMChat.findOne({ _id: chatId });
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }
    const receiver_id = await getOtherUserInRoom(chat.dmRoom, user_id);
    const cacheDmKey = `${DM_CHAT_PREFIX}${user_id}:${receiver_id}`;
    const cacheDmKey2 = `${DM_CHAT_PREFIX}${receiver_id}:${user_id}`;
    let reactionToggled = false;

    const existingReaction = chat.reactions.find((r) => r.type === reaction);

    if (existingReaction) {
      if (existingReaction.users.includes(user_id)) {
        existingReaction.users = existingReaction.users.filter(
          (id) => id.toString() !== user_id.toString()
        );
        reactionToggled = false;
      } else {
        existingReaction.users.push(user_id);
        reactionToggled = true;
      }

      if (existingReaction.users.length === 0) {
        chat.reactions = chat.reactions.filter((r) => r.type !== reaction);
      }
    } else {
      chat.reactions.push({ type: reaction, users: [user_id] });
      reactionToggled = true;
    }

    await chat.save();
    await rabbitmqService.publishInvalidation([cacheDmKey, cacheDmKey2], "dm");
    return res.status(200).json({
      success: true,
      message: reactionToggled ? "Reaction added" : "Reaction removed",
      chatId,
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

exports.delete_dm_chat = async function (req, res) {
  const { id } = req.body;
  const userId = res.locals.verified_user_id;

  try {
    const chat = await DMChat.findById(id);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    if (chat.sender.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this message",
      });
    }

    await DMChat.findByIdAndDelete(id);
    const dmRoom = chat.dmRoom;
    const receiverId = await getOtherUserInRoom(dmRoom, userId);
    const cacheDmKey = `${DM_CHAT_PREFIX}${userId}:${receiverId}`;
    const cacheDmKey2 = `${DM_CHAT_PREFIX}${receiverId}:${userId}`;

    if (receiverId) {
      req.app.get("io").to(receiverId.toString()).emit("dm_chat_deleted", {
        chatId: id,
        roomId: dmRoom.toString(),
      });
    }
    await rabbitmqService.publishInvalidation([cacheDmKey, cacheDmKey2], "dm");

    return res.status(200).json({
      success: true,
      message: "DM chat deleted successfully",
      id: id,
    });
  } catch (error) {
    console.error("Error deleting DM chat:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting DM chat",
      error: error.message,
    });
  }
};

exports.mark_dm_last_seen = async (req, res) => {
  const userId = res.locals.verified_user_id;
  const { receiver } = req.body;

  try {
    if (!receiver) {
      return res.json({
        success: false,
        message: "Receiver is required",
      });
    }
    const cacheKey = `${DM_INBOX_PREFIX}${userId}`;
    const cacheDmKey = `${DM_CHAT_PREFIX}${userId}:${receiver}`;
    const cacheDmKey2 = `${DM_CHAT_PREFIX}${receiver}:${userId}`;
    const room = await DMRoom.findOne({ users: { $all: [userId, receiver] } });
    if (!room)
      return res.json({ success: false, message: "DM room not found" });

    room.lastSeen.set(userId.toString(), new Date());
    await room.save();
    await rabbitmqService.publishInvalidation(
      [cacheKey, cacheDmKey, cacheDmKey2],
      "dm"
    );
    res.json({ success: true, message: "Last seen updated" });
  } catch (error) {
    console.error("Error updating DM last seen:", error);
    res.json({ success: false, message: "Server error" });
  }
};
