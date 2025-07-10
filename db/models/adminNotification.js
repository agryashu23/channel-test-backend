const mongoose = require("mongoose");

const AdminNotificationSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    buttonLink: {
      type: String,
      required: false,
    },
    buttonText: {
      type: String,
      required: false,
    },
    content: {
      type: String,
      required: true,
    },
    action: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);

module.exports = mongoose.model("AdminNotification", AdminNotificationSchema);
