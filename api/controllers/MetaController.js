require("dotenv").config();
var mongoose = require("mongoose");
var User = mongoose.model("User");
var Curation = mongoose.model("Curation");
var Channel = mongoose.model("Channel");

exports.profile_username = async function (req, res) {
  const username = req.params.username;

  if (!username) {
    return res
      .status(400)
      .json({ success: false, message: "Username is required." });
  }
  try {
    const user = await User.findOne({ username: username }).select(
      "name username description logo"
    );
    if (user) {
      return res.status(200).json({ success: true, user: user });
    } else {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }
  } catch (error) {
    console.error("Failed to fetch profile:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch profile." });
  }
};
exports.get_curation = async function (req, res) {
  const curId = req.params.curId;

  if (!curId) {
    return res
      .status(400)
      .json({ success: false, message: "Curation Id is required." });
  }
  try {
    const curation = await Curation.findById(curId).select(
      "name description image"
    );
    if (curation) {
      return res.status(200).json({ success: true, curation: curation });
    } else {
      return res
        .status(404)
        .json({ success: false, message: "Curation not found." });
    }
  } catch (error) {
    console.error("Failed to fetch curation:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch curation." });
  }
};
exports.get_channel = async function (req, res) {
  const channelId = req.params.channelId;

  if (!channelId) {
    return res
      .status(404)
      .json({ success: false, message: "Channel Id is required." });
  }
  try {
    const channel = await Channel.findById(channelId).select(
      "name description logo"
    );
    if (channel) {
      return res.status(200).json({ success: true, channel: channel });
    } else {
      return res
        .status(404)
        .json({ success: false, message: "Channel not found." });
    }
  } catch (error) {
    console.error("Failed to fetch channel:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch channel" });
  }
};
