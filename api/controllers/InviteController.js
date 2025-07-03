require("dotenv").config();
var mongoose = require("mongoose");
var Invite = mongoose.model("Invite");
var Channel = mongoose.model("Channel");
var Topic = mongoose.model("Topic");
var User = mongoose.model("User");

const generateCode = () => {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    code += characters[randomIndex];
  }
  return code;
};

exports.create_channel_invite = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { id,usage_limit,expire_time } = req.body;
  try {
    console.log(user_id, id);
    console.log(usage_limit, expire_time);
    const channel = await Channel.findOne({ _id: id, user: user_id });
    if (!channel || channel.user.toString() !== user_id.toString()) {
      return res.json({
        success: false,
        message:
          "Channel not found or you do not have permission to create an invite.",
      });
    }
    const code = generateCode();
    const invite = new Invite({
      code: code,
      channel: id,
      business: channel.business,
      user: user_id,
      expire_time: expire_time,
      usage_limit: usage_limit,
    });
    await invite.save();
    return res.json({
      success: true,
      message: "Invite created successfully.",
      invite: invite,
    });
  } catch (error) {
    console.error("Error creating channel invite:", error);
    return res.json({
      success: false,
      message: "Failed to create invite.",
      error: error.message,
    });
  }
};

exports.create_topic_invite = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { id,usage_limit,expire_time } = req.body;
  try {
    const topic = await Topic.findOne({ _id: id, user: user_id });
    if (!topic) {
      return res.json({
        success: false,
        message:
          "Topic not found or you do not have permission to create an invite.",
      });
    }
    const code = generateCode();
    const invite = new Invite({
      code: code,
      topic: id,
      user: user_id,
      type:"topic",
      channel: topic.channel,
      business: topic.business,
      expire_time: expire_time,
      usage_limit: usage_limit,
    });
    await invite.save();
    return res.json({
      success: true,
      message: "Invite created successfully.",
      invite: invite,
    });
  } catch (error) {
    console.error("Error creating topic invite:", error);
    return res.json({
      success: false,
      message: "Failed to create invite.",
      error: error.message,
    });
  }
};




