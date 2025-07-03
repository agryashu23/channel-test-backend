"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var APISchema = new Schema({
  api: {
    type: String,
  },
  description: {
    type: String,
  },
});

var ParameterSchema = new Schema({
  allowDM: {
    type: Boolean,
    default: true,
  },
  talkToBrand: {
    type: Boolean,
    default: true,
  },
});

var FileSchema = new Schema({
  url: {
    type: String,
  },
  description: {
    type: String,
  },
  name: {
    type: String,
    required: true,
  },
  size: {
    type: String,
    required: true,
  },
});

var BusinessSchema = new Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name:{
      type: String,
      required: false,
    },
    domain: {
      type: String,
      required: false,
      unique: true,
    },
    current_subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required:false
    },
    verificationMethod: {
      type: String,
      enum: ["dns", "file", "meta"],
      required: false,
    },
    type: {
      type: String,
      enum: ["embed", "community"],
      default: "embed",
    },
    loginControl: {
      type:String,
      enum:["api","direct"],
      default:"api"
    },
    verificationToken: {
      type: String,
    },
    provider: {
      type: String,
    },
    auto_login_request: {
      type: Boolean,
      default: false,
    },
    autoLogin: {
      type: Boolean,
      default: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    apiKey: {
      type: String,
    },
    chatSummary: {
      type: Boolean,
      default: false,
    },
    whatsappNotifications: {
      type: Boolean,
      default: false,
    },
    parameters: {
      type: ParameterSchema,
      default: () => ({})  
    },
    apiData: [APISchema],
    filesData: [FileSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Business", BusinessSchema);
