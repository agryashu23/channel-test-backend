"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var exclusiveSchema = new Schema({
  name: {
    type: String,
    required: false,
  },
  username: {
    type: String,
    required: false,
  },
  email: {
    type: String,
    required: false,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
});

var CurationSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    category: {
      type: String,
    },
    image: {
      type: String,
    },
    curators: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    saved_by: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    liked_by: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    description: {
      type: String,
    },
    chips_count: {
      type: Number,
      default: 0,
    },
    hidden: {
      type: Boolean,
      default: false,
    },
    shared_by: {
      type: Number,
    },
    searched: {
      type: Number,
    },
    engagement: {
      type: Number,
    },
    total_searched: {
      type: Number,
    },
    total_engagement: {
      type: Number,
    },
    type: {
      type: String,
      default: "curation",
    },
    edit_access: {
      type: [String],
    },
    priority: {
      type: Number,
    },
    editability: {
      type: String,
      enum: ["anyone", "me"],
      default: "anyone",
    },
    visibility: {
      type: String,
      enum: ["anyone", "me"],
      default: "anyone",
    },
    featured: {
      type: Boolean,
      default: false,
    },
    profile_category: {
      type: String,
      required: false,
    },
    participants: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: false,
        },
        lastReadMessage: {
          type: Schema.Types.ObjectId,
          ref: "Message",
          required: false,
        },
      },
    ],
    feature_users: [exclusiveSchema],
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);
module.exports = mongoose.model("Curation", CurationSchema);
