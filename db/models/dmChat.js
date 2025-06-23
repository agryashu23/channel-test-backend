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

var DMChatSchema = new Schema(
  {
    dmRoom: { type: Schema.Types.ObjectId, ref: "DMRoom", required: true },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
      ref: "DMChat",
      required: false,
      default: null,
    },

    reactions: [reactionSchema],
    summary: {
      type: String,
      required: false,
    },
    chatType: {
      type: String,
      enum: ["dm", "brand"],
      default: "dm",
    },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("DMChat", DMChatSchema);
