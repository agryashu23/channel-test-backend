"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var mediaSchema = new Schema({
  url: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  size: {
    type: String,
    required: true,
  },
  resource: {
    type: Boolean,
    required: false,
    default: false,
  },
  thumbnail: {
    type: String,
    required: false,
  },
  type: {
    type: String,
    enum: ["image", "video", "document"],
    required: true,
  },
  uploadStatus: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "completed",
  },
});

var reactionSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
    },
    users: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: false,
      },
    ],
  },
  { _id: false }
);

var ChannelChatSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    channel: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
    },
    topic: {
      type: Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      required: false,
    },
    content: {
      type: String,
      required: false,
    },
    links: [
      {
        type: String,
        required: false,
      },
    ],
    media: [mediaSchema],
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: "ChannelChat",
      required: false,
      default: null,
    },

    event: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: false,
    },
    poll: {
      type: Schema.Types.ObjectId,
      ref: "Poll",
      required: false,
    },
    reactions: [reactionSchema],
    summary: {
      type: String,
      required: false,
    },
    mentions: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: false,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChannelChat", ChannelChatSchema);
