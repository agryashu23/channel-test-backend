"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var TopicSchema = new Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Business",
    default: null,
    required: false,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: false,
  },
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Channel",
    required: true,
  },
  summaryEnabled: {
    type: Boolean,
    default: false,
  },
  summaryType: {
    type: String,
    enum: ["manual", "auto"],
    required: function () {
      return this.summaryEnabled;
    },
  },
  summaryTime: {
    type: String,
    match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    required: function () {
      return this.summaryEnabled && this.summaryType === "auto";
    },
  },

  redirect_url: {
    type: String,
  },
  paywallPrice: {
    type: Number,
    required: false,
  },
  visibility: {
    type: String,
    enum: ["anyone", "invite", "paid"],
    default: "anyone",
  },
  editability: {
    type: String,
    enum: ["anyone", "invite", "me"],
    default: "anyone",
  },
  whatsappEnabled: {
    type: Boolean,
    default: false,
  },
  whatsappSettings: {
    type: new Schema(
      {
        mode: {
          type: String,
          enum: ["admin_message", "inactivity", "trigger"],
          required: true,
        },
        inactivityDays: {
          type: Number,
          default: 3,
        },
        template: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "WhatsappTemplate",
          required: true,
        },
        brandName: {
          type: String,
          required: false,
        },
        topicName: {
          type: String,
          required: false,
        },
      },
      { _id: false }
    ),
    required: false,
    default: undefined,
  },
});

module.exports = mongoose.model("Topic", TopicSchema);
