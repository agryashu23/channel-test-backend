"use strict";
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ChannelMembershipSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" ,required:false},
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel" ,required:true},
  business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", default: null, required: false },
  role: {
    type: String,
    enum: ["admin", "editor", "member","owner"],
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
  joinedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("ChannelMembership", ChannelMembershipSchema);

