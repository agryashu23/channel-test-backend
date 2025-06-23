"use strict";
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const WhatsappTemplateSchema = new Schema({
  name: { type: String, required: true },
  templateName: { type: String, required: true },
  type: {
    type: String,
    enum: ["utility", "marketing"],
    required: true,
  },
  content: { type: String },
  defaultParams: {
    type: Map,
    of: String,
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("WhatsappTemplate", WhatsappTemplateSchema);
