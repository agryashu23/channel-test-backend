const mongoose = require("mongoose");

const AnalyticsSchema = new mongoose.Schema({
    business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    interactionCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 8 } 
});

module.exports = mongoose.model("Analytics", AnalyticsSchema);
  