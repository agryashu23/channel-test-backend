require("dotenv").config();
const sharp = require("sharp");
const path = require("path");
var mongoose = require("mongoose");
var User = mongoose.model("User");
var Plan = mongoose.model("Plan");
var Business = mongoose.model("Business");
var Payment = mongoose.model("Payment");
var Channel = mongoose.model("Channel");
var Topic = mongoose.model("Topic");
var ChannelMembership = mongoose.model("ChannelMembership");
var TopicMembership = mongoose.model("TopicMembership");
var EventMembership = mongoose.model("EventMembership");
var Transaction = mongoose.model("Transaction");
var Event = mongoose.model("Event");
const chatRabbitmqService = require("../services/chatRabbitmqService");
const rabbitmqService = require("../services/rabbitmqService");
const emailRabbitmqService = require("../services/emailRabbitmqService");
const RedisHelper = require("../../utils/redisHelpers");
const linkUserMemberships = require("../../utils/linkMembership");
const redisService = require("../services/redisService");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const BUSINESS_PREFIX = "embed:business:";

const makeChannelJoin = async (channelId, user, channel) => {
  const membership = await ChannelMembership.create({
    channel: channelId,
    user: user._id,
    email: user.email,
    business: channel.business || null,
    status: "joined",
  });
  if(channel.business){
    await RedisHelper.addUserToBusiness(channel.business, user._id);
  }

  const publicTopics = channel.topics.filter((t) => t.visibility === "anyone");
  const topicIds = publicTopics.map((t) => t._id);

  if (topicIds.length) {
    const bulkOps = topicIds.map((topicId) => ({
      insertOne: {
        document: {
          topic: topicId,
          user: user._id,
          channel: channel._id,
          business: channel.business || null,
          email: user.email,
          status: "joined",
        },
      },
    }));

    await TopicMembership.bulkWrite(bulkOps);
    await emailRabbitmqService.sendTopicMembershipRedisSyncJob({
      topicIds: topicIds,
      userId: user._id,
    });
    
   
  }
    const request_membership  = membership.toObject();
    await membership.populate([
        { path: "user", select: "_id name username logo color_logo email" },
        { path: "channel", select: "_id name logo" },
      ]);
    await RedisHelper.addUserToChannel(channelId,membership);
  const data = {
    channel: {
      ...channel,
      topics: publicTopics,
    },
    topics: topicIds,
    membership: request_membership,
    joined: true,
    joinStatus: "first",
  };
  return data;
};

const makeTopicJoin = async (topic, user) => {
  const membership = await TopicMembership.create({
    channel: topic.channel,
    topic: topic._id,
    user: user._id,
    email: user.email,
    business: topic.business,
    status: "joined",
  });
  const request_membership  = membership.toObject();
      await membership.populate([
        { path: "user", select: "_id name username logo color_logo email" },
        { path: "topic", select: "_id name" },
      ]);
    await RedisHelper.addUserToTopic(topic._id, membership);
    const data = {
      topic: topic,
      membership: request_membership,
      joined: true,
    };
  return data;
};

const makeEventJoin = async (event, user) => {
  const membership = await EventMembership.create({
    event: event._id,
    user: user._id,
    topic: event.topic,
    status: "joined",
    business: event.business,
  });
  await Promise.all([
    RedisHelper.addUserEventMembership(event.topic, user._id, membership),
    RedisHelper.addMemberToEvent(event._id,membership),
  ]);
  const data = {
    event: event,
    joined: true,
    membership: membership,
  };
  return data;
};

exports.verify_payment = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;

  const secret = process.env.RAZORPAY_KEY_SECRET;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    await Transaction.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      { status: "failed" }
    );
    return res.json({
      success: false,
      status: "failed",
      message: "Invalid signature",
    });
  }
  let paymentDetails = {};
  try {
    paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
  } catch (err) {
    console.error("Razorpay fetch error:", err.message);
  }
  const [txn, user] = await Promise.all([
    Transaction.findOne({ razorpayOrderId: razorpay_order_id }),
    User.findById(user_id).select("_id email").lean(),
  ]);
  if (!user) {
    return res.json({
      success: false,
      message: "Account doesn't exist. Please contact support ",
    });
  }
  if (!txn) {
    return res.json({ success: false, message: "Transaction not found" });
  }
  const paidAt = new Date();
  const paymentMethod = paymentDetails?.method || null;
  const contact = paymentDetails?.contact || null;
  const email = paymentDetails?.email || null;

  const txnUpdate = {
    status: "success",
    razorpayPaymentId: razorpay_payment_id,
    paidAt,
    email,
    contact,
    paymentMethod,
  };

  let joinData = {};
  const cacheKeys = [];

  if (txn.type === "subscription") {
    let business = await Business.findOne({ user_id: user_id }).select(
      "_id type"
    );
    const { planId, billingCycle } = txn;
    const expiresAt = new Date(paidAt);
    if (billingCycle === "monthly")
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    else if (billingCycle === "annually")
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    expiresAt.setHours(23, 59, 59, 999);
    const payment = await Payment.create({
      user: user_id,
      planId,
      billingCycle,
      startedAt: paidAt,
      expiresAt,
      isPayAsYouGo: planId === "enterprise",
    });
    if (!business) {
      business = await Business.create({
        user: user_id,
        type: "community",
        isVerified: true,
        current_subscription: payment._id,
      });
      await shiftUserToBusiness(user_id, business._id);
    } else if (
      business &&
      (business.type === "community" || business.type === "embed")
    ) {
      business.current_subscription = payment._id;
      await business.save();
      cacheKeys.push(`${BUSINESS_PREFIX}${user_id}`);
    }
    txnUpdate.paymentSubscription = payment._id;
    txnUpdate.business = business._id;
  } else if (txn.type === "channel") {
    const channel = await Channel.findById(txn.channel)
      .populate([
        { path: "topics", select: "name _id editability visibility" },
        { path: "user", select: "name username _id logo color_logo" },
      ])
      .lean();
    if (channel) {
      txnUpdate.business = channel.business || null;
      const data = await makeChannelJoin(channel._id, user, channel);
      joinData = data;
    }
  } else if (txn.type === "topic") {
    const topic = await Topic.findById(txn.topic)
      .select("name visibility editability paywallPrice channel business _id")
      .lean();
    if (topic) {
      txnUpdate.business = topic.business || null;
      const data = await makeTopicJoin(topic, user);
      joinData = data;
    }
  } else if (txn.type === "event") {
    const event = await Event.findById(txn.event)
      .select("business _id topic paywallPrice type name")
      .lean();
    if (event) {
      txnUpdate.business = event.business || null;
      const data = await makeEventJoin(event, user);
      
      joinData = data;
    }
  }
  await Transaction.findByIdAndUpdate(txn._id, { $set: txnUpdate });
  if (cacheKeys.length) {
    await rabbitmqService.publishInvalidation(cacheKeys, "payment");
  }
  const { cacheKeys: _, ...cleanJoinData } = joinData;
  res.json({
    success: true,
    status: "success",
    message: "Payment verified",
    ...cleanJoinData,
    type: txn.type,
    ...(txn.type === "subscription" && {
      payment: txnUpdate.paymentSubscription,
    }),
  });
};

exports.failed_payment = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { id } = req.body;
  console.log(id);
  try {
    const txn = await Transaction.findOne({
      razorpayOrderId: id,
      user: user_id,
    });
    console.log(txn);
    if (!txn) {
      return res.json({ success: false, message: "Transaction not found" });
    }
    await Transaction.findByIdAndUpdate(txn._id, { status: "failed" });
    return res.json({ success: true, message: "Payment failed" });
  } catch (error) {
    return res.json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
