require("dotenv").config();
const sharp = require("sharp");
const path = require("path");
var mongoose = require("mongoose");
var User = mongoose.model("User");
var Plan = mongoose.model("Plan");
var Business = mongoose.model("Business");
var Transaction = mongoose.model("Transaction");
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.create_order_subscription = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { amount, currency = "INR", planId, billingCycle } = req.body;
  try {
    amount = amount * 100;
    const options = {
      amount: amount,
      currency,
      receipt: `receipt_order_${Date.now()}`,
    };
    const razorpayOrder = await razorpay.orders.create(options);
    const transaction = await Transaction.create({
      user: user_id,
      planId,
      billingCycle,
      amount,
      currency,
      type: "subscription",
      razorpayOrderId: razorpayOrder.id,
      status: "pending",
    });
    res.json({
      id: razorpayOrder.id,
      currency: razorpayOrder.currency,
      amount: razorpayOrder.amount,
      transactionId: transaction._id,
    });
  } catch (error) {
    res.json({ success: false, message: "Error creating transaction" });
  }
};

exports.create_order_event = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { amount, currency = "INR", event } = req.body;
  try {
    amount = amount * 100;
    const options = {
      amount: amount,
      currency,
      receipt: `receipt_order_${Date.now()}`,
    };
    const razorpayOrder = await razorpay.orders.create(options);
    const transaction = await Transaction.create({
      user: user_id,
      event,
      amount,
      currency,
      type: "event",
      razorpayOrderId: razorpayOrder.id,
      status: "pending",
    });
    res.json({
      id: razorpayOrder.id,
      currency: razorpayOrder.currency,
      amount: razorpayOrder.amount,
      transactionId: transaction._id,
    });
  } catch (error) {
    res.json({ success: false, message: "Error creating transaction" });
  }
};
