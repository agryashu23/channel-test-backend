"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var PollSchema = new Schema(
  {
    question: {
      type: String,
      required: false,
    },
    type: {
      type: String,
      enum: ["public", "private"],
      default: "private",
    },
    options: [
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
    responses: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        choice: [
          {
            type: String,
          },
        ],
      },
    ],
    anonymousResponses: [
      {
        choice: [String],
        ip: String,
      },
    ],
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
