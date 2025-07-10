"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var PollVoteSchema = new Schema({
  poll: {
    type: Schema.Types.ObjectId,
    ref: "Poll",
    required: true,
  },
  topic: {
    type: Schema.Types.ObjectId,
    ref: "Topic",
    required: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  ip: {
    type: String,
    required: false,
  },
  choice: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model("PollVote", PollVoteSchema);
