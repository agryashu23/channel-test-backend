const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    planId: { type: String, ref: "Plan", required: true },
    billingCycle: {
      type: String,
      enum: ["monthly", "annually"],
      required: true,
    },
    isPayAsYouGo: { type: Boolean, default: false },
    startedAt: { type: Date, required: false },
    expiresAt: { type: Date, required: false },
    isActive: { type: Boolean, default: true },
    autoRenew: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Payment", paymentSchema);
