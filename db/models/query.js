"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

const QuerySchema = new Schema({
  text: {
    type: String,
    required: false,
  },
  images: [
    {
      type: String,
      required: false,
    },
  ],
  email: {
    type: String,
    required: false,
  },
});

module.exports = mongoose.model("Query", QuerySchema);
