"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

const SummarySchema = new Schema(
  {
    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    type: {
      type: String,
      enum: ["manual", "auto"],
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    tokensUsed: { type: Number },
    startTime: { type: Date },
    endTime: { type: Date },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);

module.exports = mongoose.model("Summary", SummarySchema);
