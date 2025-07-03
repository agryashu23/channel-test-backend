require("dotenv").config();
const sharp = require("sharp");
const path = require("path");
var mongoose = require("mongoose");
var User = mongoose.model("User");
var Plan = mongoose.model("Plan");
var Business = mongoose.model("Business");
var Transaction = mongoose.model("Transaction");
var Channel = mongoose.model("Channel");
var Topic = mongoose.model("Topic");
var Payment = mongoose.model("Payment");
var Event = mongoose.model("Event");
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.create_transaction_order = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  let {
    amount,
    currency = "INR",
    planId = null,
    billingCycle = null,
    type = "subscription",
    channel = null,
    topic = null,
    event = null,
  } = req.body;

  if (!amount || isNaN(amount) || amount <= 0) {
    return res.json({ success: false, message: "Invalid amount" });
  }

  try {
    let baseAmount = Math.floor(amount * 100);
    let gstAmount = type === "subscription" ? Math.floor(baseAmount * 0.18) : 0;
    let orderAmount = baseAmount + gstAmount;
    const options = {
      amount: orderAmount,
      currency,
      receipt: `receipt_order_${Date.now()}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);
    let business = null;
    if (type === "channel" && channel) {
      const channelData = await Channel.findById(channel)
        .select("business")
        .lean();
      business = channelData.business;
    } else if (type === "topic" && topic) {
      const topicData = await Topic.findById(topic).select("business").lean();
      business = topicData.business;
    } else if (type === "event" && event) {
      const eventData = await Event.findById(event).select("business").lean();
      business = eventData.business;
    }
    const transaction = await Transaction.create({
      user: user_id,
      planId,
      billingCycle,
      amount: Math.floor(orderAmount / 100),
      currency,
      type,
      razorpayOrderId: razorpayOrder.id,
      status: "pending",
      channel,
      business,
      topic,
      event,
    });

    res.json({
      success: true,
      id: razorpayOrder.id,
      currency: razorpayOrder.currency,
      amount: razorpayOrder.amount,
      transactionId: transaction._id,
    });
  } catch (error) {
    console.error("Transaction creation failed:", error);
    res.status(500).json({
      success: false,
      message: "Error creating transaction",
      error: error.message,
    });
  }
};

exports.fetch_transaction_history = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  try {
    const transactions = await Transaction.find({
      type: "subscription",
      user: user_id,
    })
      .select(
        "_id amount status razorpayOrderId createdAt planId paymentMethod"
      )
      .populate("planId", "name")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ success: true, transactions: transactions });
  } catch (error) {
    return res.json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

exports.calculate_upgrade_details = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  let { amount, currency = "INR", planId, billingCycle } = req.body;

  if (!amount || isNaN(amount) || amount <= 0 || !planId || !billingCycle) {
    return res
      .status(400)
      .json({
        success: false,
        message: "Invalid amount or planId or billingCycle",
      });
  }

  try {
    let orderAmount = amount * 100;
    let gstAmount = orderAmount * 0.18;
    let creditAmount = 0;
    const data = {
      amount: orderAmount,
      gstAmount: gstAmount,
      creditAmount: creditAmount,
      totalAmount: orderAmount + gstAmount,
      currency,
      oldPlanId: "basic",
      planId,
      billingCycle,
    };
    const business = await Business.findOne({ user_id: user_id })
      .select("_id current_subscription")
      .lean();
    if (!business || !business.current_subscription) {
      return res.json({
        success: true,
        message: "Business not found",
        data: data,
      });
    }
    const payment_id = business.current_subscription;
    const payment = await Payment.findById(payment_id)
      .select("planId startedAt expiresAt billingCycle")
      .populate("planId", "_id name pricing")
      .lean();
    if (!payment || !payment.planId || !payment.expiresAt) {
      return res.json({
        success: true,
        message: "Payment not found",
        data: data,
      });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const expiresAtDate = new Date(payment.expiresAt);
    const expiry = new Date(
      expiresAtDate.getFullYear(),
      expiresAtDate.getMonth(),
      expiresAtDate.getDate()
    );
    const diffMs = expiry - today;
    const remainingDays = Math.max(
      0,
      Math.floor(diffMs / (1000 * 60 * 60 * 24))
    );

    const currentCycle = payment.billingCycle || "monthly";
    const currentPlanPrice =
      payment.planId?.pricing?.[currentCycle]?.price || 0;

    creditAmount = Math.floor((remainingDays / 30) * currentPlanPrice * 100);
    const discountedAmount = Math.max(0, orderAmount - creditAmount);
    gstAmount = discountedAmount * 0.18;
    const totalAmount = Math.floor(discountedAmount + gstAmount);

    return res.json({
      success: true,
      data: {
        amount: orderAmount,
        creditAmount,
        oldPlanId: payment.planId._id,
        gstAmount: Math.floor(gstAmount),
        totalAmount,
        currency,
        planId,
        billingCycle,
        remainingDays: Math.floor(remainingDays),
      },
    });
  } catch (error) {
    console.error("Transaction creation failed:", error);
    res.status(500).json({
      success: false,
      message: "Error creating transaction",
      error: error.message,
    });
  }
};
