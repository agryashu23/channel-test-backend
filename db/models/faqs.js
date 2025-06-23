"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var faqSchema = new Schema({
  question: {
    type: String,
    required: true,
  },
  answer: {
    type: String,
    required: true,
  },
});

var FaqsSchema = new Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  faqs: [faqSchema],
});

module.exports = mongoose.model("Faqs", FaqsSchema);
