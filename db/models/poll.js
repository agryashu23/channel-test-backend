"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var PollSchema = new Schema(
  {
    question: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      default: "Poll",
    },
    type: {
      type: String,
      enum: ["public", "private"],
      default: "public",
    },
    visibility: {
      type: String,
      enum: ["anyone", "topic"],
      default: "anyone",
    },
    choices: [
      {
        type: String,
        required: false,
      },
    ],
    multipleChoice: {
      type: Boolean,
      default: false,
    },
    isClosed: {
      type: Boolean,
      default: false,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      required: false,
    },
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChannelChat",
      required: false,
    },
    showResults: {
      type: String,
      enum: ["always", "afterVote", "adminOnly"],
      default: "afterVote",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Poll", PollSchema);
