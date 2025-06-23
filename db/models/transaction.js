const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: false,
    },
    paymentSubscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required: false,
    },

    planId: { type: String, ref: "Plan", required: false },
    billingCycle: {
      type: String,
      enum: ["monthly", "annually"],
      required: false,
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["success", "failed", "pending"],
      default: "pending",
    },
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String, required: false },
    razorpayInvoiceId: { type: String, required: false },
    email: {
      type: String,
      required: false,
    },
    contact: {
      type: String,
      required: false,
    },
    paymentMethod: {
      type: String,
      required: false,
    },
    type: {
      type: String,
    },
    paidAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

transactionSchema.pre("validate", function (next) {
  if (!this._id) {
    this._id = `CHNL-TXN-${Date.now()}`;
  }
  next();
});

module.exports = mongoose.model("Transaction", transactionSchema);
