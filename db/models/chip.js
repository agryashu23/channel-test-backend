"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var mediaSchema = new Schema(
  {
    id: {
      type: String,
    },
    source: {
      type: String,
    },
    url: {
      type: String,
      required: false,
    },
    thumbnail: {
      type: String,
      requires: false,
    },
    exclusive: {
      type: Boolean,
      default: false,
      required: false,
    },
    type: {
      type: String,
    },
  },
  { _id: false }
);

var docSchema = new Schema({
  name: {
    type: String,
    required: false,
  },
  pages: {
    type: String,
    required: false,
  },
  url: {
    type: String,
    required: false,
  },
  exclusive: {
    type: Boolean,
    default: false,
  },
});
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

var metaSchema = new Schema({
  ogTitle: {
    type: String,
  },
  ogImage: {
    type: String,
  },
  ogDescription: {
    type: String,
  },
  ogSiteName: {
    type: String,
  },
  ogUrl: {
    type: String,
  },
});
var dateSchema = new Schema({
  date: {
    type: String,
    required: false,
  },
  exclusive: {
    type: Boolean,
    required: false,
    default: false,
  },
  event: {
    type: String,
  },
  start_time: {
    type: String,
  },
  end_time: {
    type: String,
  },
});
var locationSchema = new Schema({
  text: {
    type: String,
    required: false,
  },
  url: {
    type: String,
    required: false,
  },
  exclusive: {
    type: Boolean,
    required: false,
    default: false,
  },
});

var ChipSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    curation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Curation",
      required: false,
    },
    category: {
      type: String,
      required: false,
    },
    text: {
      type: String,
    },
    type: {
      type: String,
      default: "chip",
    },
    date: dateSchema,
    location: locationSchema,
    image_urls: [mediaSchema],
    link: {
      type: String,
    },
    metaLink: metaSchema,
    upvotes: [
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
    shared_by: {
      type: Number,
    },
    searched: {
      type: Number,
    },
    edit_access: {
      type: [String],
    },
    comments: {
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
    document: docSchema,
    priority: {
      type: Number,
    },
    hidden: {
      type: Boolean,
      default: false,
    },
    visibility: {
      type: String,
      enum: ["anyone", "me"],
      default: "anyone",
    },
    link_exclusive: {
      type: Boolean,
      default: false,
    },
    text_exclusive: {
      type: Boolean,
      default: false,
    },
    profile_category: {
      type: String,
      required: false,
    },
    exclusive_users: [exclusiveSchema],
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);

module.exports = mongoose.model("Chip", ChipSchema);
