require("dotenv").config();
const sharp = require("sharp");
const path = require("path");
var mongoose = require("mongoose");
var User = mongoose.model("User");
var Plan = mongoose.model("Plan");
var Business = mongoose.model("Business");
var Payment = mongoose.model("Payment");
var Event = mongoose.model("Event");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.verify_payment_subscription = async function (req, res) {
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
  const txn = await Transaction.findOne({ razorpayOrderId: razorpay_order_id });
  if (!txn)
    return res.json({ success: false, message: "Transaction not found" });

  const { planId, billingCycle } = txn;
  const paidAt = new Date();
  const expiresAt = new Date(paidAt);

  if (billingCycle === "monthly") expiresAt.setMonth(expiresAt.getMonth() + 1);
  else if (billingCycle === "annually")
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  expiresAt.setHours(23, 59, 59, 999);
  const payment = await Payment.create({
    user: user_id,
    planId,
    billingCycle,
    startedAt: paidAt,
    expiresAt,
    isPayAsYouGo: planId === "enterprise" ? true : false,
  });
  const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
  const paymentMethod = paymentDetails.method;
  const contact = paymentDetails.contact;
  const email = paymentDetails.email;
  await Transaction.findOneAndUpdate(
    { razorpayOrderId: razorpay_order_id },
    {
      status: "success",
      razorpayPaymentId: razorpay_payment_id,
      paidAt,
      paymentSubscription: payment._id,
      email,
      contact,
      paymentMethod,
    }
  );
  await User.findByIdAndUpdate(user_id, {
    current_subscription: payment._id,
  });
  res.json({
    success: true,
    status: "success",
    message: "Payment verified",
    payment: payment,
  });
};

exports.verify_payment_event = async function (req, res) {
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
  const txn = await Transaction.findOne({ razorpayOrderId: razorpay_order_id });
  if (!txn)
    return res.json({ success: false, message: "Transaction not found" });

  const { event } = txn;
  const paidAt = new Date();

  const eventData = await Event.findById(event);
  if (!eventData.joined_users.includes(user_id)) {
    eventData.joined_users.push(user_id);
    await eventData.save();
  }
  const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
  const paymentMethod = paymentDetails.method;
  const contact = paymentDetails.contact;
  const email = paymentDetails.email;

  const updatedTransaction = await Transaction.findOneAndUpdate(
    { razorpayOrderId: razorpay_order_id },
    {
      status: "success",
      razorpayPaymentId: razorpay_payment_id,
      paidAt,
      email,
      contact,
      paymentMethod,
    }
  );
  res.json({
    success: true,
    status: "success",
    message: "Payment verified",
    transaction: updatedTransaction,
  });
};
