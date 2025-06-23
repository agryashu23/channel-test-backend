"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

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

var AdminSchema = new Schema({
  email: [
    {
      type: String,
    },
  ],
  banner_cards: [imageSchema],

  notifications: [
    {
      type: String,
    },
  ],
});
module.exports = mongoose.model("Admin", AdminSchema);
