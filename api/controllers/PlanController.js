require("dotenv").config();
const sharp = require("sharp");
const path = require("path");
var mongoose = require("mongoose");
var User = mongoose.model("User");
var Plan = mongoose.model("Plan");
var Business = mongoose.model("Business");
const redisService = require("../services/redisService");

const PLAN_PREFIX = "plans:";

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
    if (cachedData) {
      return res.json({success:true, plans:cachedData });
    }
    const plans = await Plan.find({}).lean();
    await redisService.setCache(cacheKey, plans,3600*24);
    res.json({success:true, plans:plans });
  } catch (error) {
    console.error("Error fetching plans:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

