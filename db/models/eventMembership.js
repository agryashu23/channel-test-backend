"use strict";
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const EventMembershipSchema = new Schema({
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required:true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required:true },
    topic: { type: mongoose.Schema.Types.ObjectId, ref: "Topic", required:true },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      required: false,
    },
    role: {
      type: String,
      enum: ["admin", "member", "owner"],
      default: "member",
    },
    status: { 
        type: String, 
        enum: ["joined", "request"], 
        default:"joined"
     },
    addedToCalendar: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now },
  });

module.exports = mongoose.model("EventMembership", EventMembershipSchema);
  