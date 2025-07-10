require("dotenv").config();
var mongoose = require("mongoose");
var Invite = mongoose.model("Invite");
var Channel = mongoose.model("Channel");
var Topic = mongoose.model("Topic");
var User = mongoose.model("User");
const ChannelMembership = mongoose.model("ChannelMembership");
const TopicMembership = mongoose.model("TopicMembership");
const RedisHelper = require("../../utils/redisHelpers");

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
    const membership = await RedisHelper.getChannelMembership(user_id, id);
    if(!membership || membership.role !== "owner" && membership.role !== "admin"){
      return res.json({
        success: false,
        message: "You don't have permission to create an invite.",
      });
    }
    const code = generateCode();
    const invite = new Invite({
      code: code,
      channel: id,
      business: membership.business,
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
    const membership = await RedisHelper.getTopicMembership(user_id, id);
    if(!membership || membership.role !== "owner" && membership.role !== "admin"){
      return res.json({
        success: false,
        message: "You don't have permission to create an invite.",
      });
    }
    const code = generateCode();
    const invite = new Invite({
      code: code,
      topic: id,
      user: user_id,
      type:"topic",
      channel: membership.channel,
      business: membership.business,
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




