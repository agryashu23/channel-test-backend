"use strict";
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const contentBlockSchema = new Schema({
  type: {
    type: String,
    enum: ["text", "image", "button", "link"],
    required: true,
  },
  content: String,
  imageUrl: String,
  link: String,
});

const NewsletterSchema = new Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    headerImage: { type: String },
    headerText: { type: String },
    contentBlocks: [contentBlockSchema],
    footerText: { type: String },
    targetUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    sendToAllInBusiness: {
      type: Boolean,
      default: false,
    },
    emailsSentCount: {
      type: Number,
      default: 0,
    },
    isSent: {
      type: Boolean,
      default: false,
    },
    testCount: {
      type: Number,
      default: 0,
    },
    lastTestedAt: {
      type: Date,
    },
    scheduledFor: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Newsletter", NewsletterSchema);
