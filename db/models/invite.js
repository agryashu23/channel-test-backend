"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var InviteSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
    code: {
      type: String,
      required: true,
      unique: true,
    },
    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: false,
    },
    type: {
      type: String,
      enum: ["topic", "channel"],
      default: "channel",
    },
    expire_time: {
      type: Date,
      required: false,
      default:Date.now()+1000*60*60*24*7,
    },
    usage_limit: {
      type: Number,
      default:100,
    },
    used_by: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    status: {
      type: String,
      enum: ["active", "expired", "revoked"],
      default: "active",
    },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);

module.exports = mongoose.model("Invite", InviteSchema);
