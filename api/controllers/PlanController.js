require("dotenv").config();
const sharp = require("sharp");
const path = require("path");
var mongoose = require("mongoose");
var User = mongoose.model("User");
var Plan = mongoose.model("Plan");
var Business = mongoose.model("Business");
var Payment = mongoose.model("Payment");
const redisService = require("../services/redisService");

const PLAN_PREFIX = "plans:";
const BUSINESS_PLAN_PREFIX = "business:plans:";

const paymentPlans = ["basic","pro","businessA","businessB","enterprise"];


  exports.create_plan = async function (req, res) {
    const {} = req.body;
    try {
      const plan = new Plan(req.body);
      await plan.save();
      res.status(201).json({ message: "Plan created successfully", plan });
    } catch (error) {
      console.error("Error creating plan:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };

exports.get_plans = async function (req, res) {
  try {
    const cacheKey = `${PLAN_PREFIX}all`;
    const cachedData = await redisService.getCache(cacheKey);
    // if (cachedData) {
    //   return res.json({success:true, plans:cachedData });
    // }
    const plans = await Plan.find({}).lean();
    await redisService.setCache(cacheKey, plans,3600*24);
    res.json({success:true, plans:plans });
  } catch (error) {
    console.error("Error fetching plans:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.fetch_business_plans = async function (req, res) {
  const user_id = res.locals.verified_user_id;

  try {
    const cacheKey = `${BUSINESS_PLAN_PREFIX}${user_id}`;
    let cachedPlans = await redisService.getCache(cacheKey);
    if (cachedPlans) {
      return res.json({success:true, plans:cachedPlans ,message:"Plans fetched from cache"});
    }
    let [business,plans] = await Promise.all([
      Business.findOne({ user_id }).select("_id current_subscription").lean(),
      Plan.find({}).lean(),
    ]);
    if (!business) {
      return res.json({ success: true, plans:plans, message: "Business not found" });
    }

    const current_subscription = business.current_subscription;

    if (!current_subscription) {
      const sortedPlans = paymentPlans
        .map(planId => plans.find(p => p._id === planId))
        .filter(Boolean);
      await redisService.setCache(cacheKey, sortedPlans, 3600 * 24);
      return res.json({
        success: true,
        plans: sortedPlans,
        message: "No active subscription. Showing all plans.",
      });
    }
    const payment = await Payment.findById(current_subscription).select("planId").lean();
    if (!payment) {
      return res.json({ success: false, message: "Subscription not found in DB" });
    }
    const currentPlanId = payment.planId;
    const currentPlanIndex = paymentPlans.indexOf(currentPlanId);
    if (currentPlanIndex === -1) {
      return res.json({ success: false, message: "Invalid current plan ID" });
    }
    const eligiblePlans = paymentPlans.slice(currentPlanIndex); 
    const filteredPlans = eligiblePlans
      .map(planId => plans.find(p => p._id === planId))
      .filter(Boolean);
    await redisService.setCache(cacheKey, filteredPlans, 3600 * 24);
    return res.json({
      success: true,
      currentPlanId,
      plans: filteredPlans,
    });

  } catch (error) {
    console.error("Error fetching plans:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



