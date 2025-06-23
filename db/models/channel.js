"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var ChannelSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      required: false,
    },
    name: {
      type: String,
      required: true,
    },
    topics: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Topic",
      },
    ],
    paywall: {
      type: Boolean,
      default: false,
    },
    paywallPrice: {
      type: String,
      required: false,
    },
    category: {
      type: String,
    },
    logo: {
      type: String,
    },
    description: {
      type: String,
    },
    cover_image: {
      type: String,
    },
    redirect_url: {
      type: String,
    },
    engagement: {
      type: Number,
    },
    total_engagement: {
      type: Number,
    },
    visibility: {
      type: String,
      enum: ["anyone", "invite"],
      default: "anyone",
    },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);

module.exports = mongoose.model("Channel", ChannelSchema);
