"use strict";
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const EventMembershipSchema = new Schema({
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required:true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required:true },
    topic: { type: mongoose.Schema.Types.ObjectId, ref: "Topic", required:true },
    status: { 
        type: String, 
        enum: ["joined", "request"], 
        default:"joined"
     },
    addedToCalendar: { type: Boolean, default: false },
    joinedAt: { type: Date },
  });

module.exports = mongoose.model("EventMembership", EventMembershipSchema);
  