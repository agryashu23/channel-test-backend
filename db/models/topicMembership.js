"use strict";
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const TopicMembershipSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
    },
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      required: false,
    },
    role: {
      type: String,
      enum: ["admin", "editor", "member"],
      default: "member",
    },
    email: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["joined", "request","processing"],
      default: "joined",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    lastActiveAt: {
      type: Date,
    },
    lastReadAt: {
      type: Date,
    },
    notificationsEnabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("TopicMembership", TopicMembershipSchema);
