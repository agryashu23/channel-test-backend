var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var WaitlistSchema = new Schema(
  {
    email: {
      type: String,
      unique: true,
      required: true,
    },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);

module.exports = mongoose.model("Waitlist", WaitlistSchema);
