"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var EventSchema = new Schema(
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
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      required: false,
    },
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChannelChat",
      default: null,
      required: false,
    },
    type: {
      type: String,
      enum: ["online", "offline"],
      default: "offline",
    },
    name: {
      type: String,
      required: false,
    },
    paywall: {
      type: Boolean,
      default: false,
    },
    paywallPrice: {
      type: String,
      required: false,
    },
    description: {
      type: String,
      required: false,
    },
    startDate: {
      type: String,
      required: false,
    },
    endDate: {
      type: String,
      required: false,
    },
    startTime: {
      type: String,
      required: false,
    },
    endTime: {
      type: String,
      required: false,
    },
    timezone: {
      type: String,
      required: false,
      default: "Asia/Kolkata",
    },
    locationText: {
      type: String,
      required: false,
    },
    location: {
      type: String,
      required: false,
    },
    meet_url: {
      type: String,
      required: false,
    },
    cover_image: {
      type: String,
      required: false,
    },
    cover_image_source: {
      type: String,
      required: false,
    },
    featured: {
      type: Boolean,
    },
    joining: {
      type: String,
      enum: ["public", "private"],
      default: "public",
    },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);

module.exports = mongoose.model("Event", EventSchema);
