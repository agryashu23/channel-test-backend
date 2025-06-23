require("dotenv").config();
var mongoose = require("mongoose");
var Waitlist = mongoose.model("Waitlist");

exports.join_waitlist = async function (req, res) {
  const { email } = req.body;
  try {
    const waiting = await Waitlist.findOne({ email: email });
    if (waiting) {
      res.json({
        success: false,
        message: "Joined already! Will be launching soon.",
      });
    } else {
      const wait = await Waitlist.create({ email: email });
      res.json({
        success: true,
        message: "Hurray! You are on waitlist.",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "An error occurred while joining the waitlist.",
      error: error.message,
    });
  }
};
