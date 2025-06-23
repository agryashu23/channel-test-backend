"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var LinkSchema = new Schema({
  id: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  image: {
    type: String,
    required: true,
  },
  value: {
    type: String,
    required: false,
  },
});

var imageSchema = new Schema({
  id: {
    type: String,
  },
  url: {
    type: String,
  },
  source: {
    type: String,
  },
});
var UserSchema = new Schema(
  {
    name: {
      type: String,
      required: false,
    },
    email: {
      type: String,
      unique: true,
      dropDups: true,
      required: [true, "Please enter Email Address"],
    },
    password: {
      type: String,
      required: false,
    },
    allowDM: {
      type: Boolean,
      default: true,
    },
    logo: {
      type: String,
    },
    username: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
    },
    links: [LinkSchema],
    resetPasswordToken: {
      type: String,
    },
    resetPasswordExpires: {
      type: Date,
    },
    location: {
      type: String,
    },
    contact: {
      type: String,
    },
    contact_verified: {
      type: Boolean,
      default: true,
    },
    customText: {
      type: String,
    },
    customUrl: {
      type: String,
    },
    otherLink: {
      type: String,
    },
    imageCards: [imageSchema],
    token: {
      type: String,
    },
    auth_token: {
      type: String,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    current_subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      required: false,
    },
    color_logo: {
      type: String,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    verified_domains: [{ type: String }],
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);

module.exports = mongoose.model("User", UserSchema);
