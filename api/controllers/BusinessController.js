require("dotenv").config();
const mongoose = require("mongoose");
const ChannelMembership = mongoose.model("ChannelMembership");
const TopicMembership = mongoose.model("TopicMembership");
const Channel = mongoose.model("Channel");
const Topic = mongoose.model("Topic");
const User = mongoose.model("User");
const Business = mongoose.model("Business");
const { uploadFileToS3 } = require("../aws/uploads/Images");

const pLimit = require('p-limit');
const redisService = require("../services/redisService");
const {preprocessMembershipRows, syncMembershipsFromAdminInitial,syncMembershipsFromAdmin} = require("../../utils/linkMembership");
const rabbitmqService = require("../services/rabbitmqService");

const BUSINESS_PREFIX = "embed:business:";


exports.fetch_business_credentials = async function (req, res) {
  const user_id = res.locals.verified_user_id;

  try {
    const cacheKey = `${BUSINESS_PREFIX}${user_id}`;
    const cachedVal = await redisService.getCache(cacheKey);
    if (cachedVal) {
      return res.json(cachedVal);
    }
    const business = await Business.findOne({ user_id }).lean();

    if (!business) {
      return res.json({
        success: false,
        message: "Invalid account details",
      });
    }
    const response = {
      success: true,
      message: "Fetched credentials",
      business: business,
    };
    await redisService.setCache(cacheKey, response, 3600);
    return res.json(response);
  } catch (error) {
    return res.json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

exports.save_admin_api = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { api, description } = req.body;
  if (!api) {
    return res.status(400).json({
      success: false,
      message: "API code is required.",
    });
  }

  try {
    const business = await Business.findOne({ user_id });
    const cacheKey = `${BUSINESS_PREFIX}${user_id}`;

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Invalid account details",
      });
    }
    business.apiData.push({ api, description });
    await business.save();
    await rabbitmqService.publishInvalidation([cacheKey], "embed");
    return res.status(200).json({
      success: true,
      message: "API saved successfully",
      apis: business.apiData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
      error: error.message,
    });
  }
};

exports.save_admin_upload = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { fileData, description } = req.body;

  const imageData = JSON.parse(fileData);

  try {
    const business = await Business.findOne({ user_id });
    const cacheKey = `${BUSINESS_PREFIX}${user_id}`;
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Invalid account details",
      });
    }
    let imageUrl = "";
    if (req.file) {
      imageUrl = await uploadFileToS3(req.file, "business");
    }
    const data = {
      url: imageUrl,
      description: description,
      name: imageData.name,
      size: imageData.size,
    };

    business.filesData.push(data);
    await business.save();
    await rabbitmqService.publishInvalidation([cacheKey], "embed");
    return res.status(200).json({
      success: true,
      message: "Upload saved successfully",
      files: business.filesData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
      error: error.message,
    });
  }
};

exports.request_login_auto = async function (req, res) {
  const { apiKey } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    const cacheKey = `${BUSINESS_PREFIX}${user_id}`;
    const business = await Business.findOne({ apiKey: apiKey });
    if (!business) {
      return res.json({
        success: false,
        message: "No business found with the provided apiKey.",
      });
    }
    business.auto_login_request = true;
    await business.save();
    await rabbitmqService.publishInvalidation([cacheKey], "embed");
    return res.json({
      success: true,
      message: "Auto Login request done successfully.",
    });
  } catch (error) {
    console.error("Failed to auto login request:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to auto login request." });
  }
};


exports.syncInitialAdminData = async function (req, res) {
    const limit = pLimit(10); 
    const { rawRows,business } = req.body;
    const { validRows } = preprocessMembershipRows(rawRows);
    const results = [];
    const channelCache = new Map(); 
    const topicCache = new Map();   
    try{
    await Promise.all(
      validRows.map(row =>
        limit(async () => {
          const result = await syncMembershipsFromAdminInitial({ business, ...row, channelCache, topicCache });
          results.push(result);
        })
      )
    );
    const allCacheKeys = results.flatMap(r => r.cacheKeys);
    await rabbitmqService.publishInvalidation(allCacheKeys, 'admin');
    return res.json({
        success: true,
        message: "Admin data synced successfully validating in 30-60 seconds",
    });
    }catch(error){
        console.error(error);
        res.json({
            success: false,
            message: "Error syncing admin data. Please try again later.",
        });
    }
};
  
exports.syncAdminData = async function (req, res) {
    const { email, channelName, business } = req.query;
    let topicNames = [];
    try {
      topicNames = JSON.parse(req.query.topicNames || "[]");
      if (!Array.isArray(topicNames)) throw new Error("Invalid");
    } catch (err) {
      return res.json({
        success: false,
        message: "Invalid topicNames format. Must be a JSON array.",
      });
    }
    if (!email || !channelName || !business) {
      return res.json({
        success: false,
        message: "Missing required query parameters.",
      });
    }
    try {
      const result = await syncMembershipsFromAdmin({ business, email, channelName, topicNames });
      await rabbitmqService.publishInvalidation(result, 'admin');
      return res.json({
        success: true,
        message: "Admin data synced successfully",
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Error syncing admin data. Please try again later.",
      });
    }
  };

  exports.fetch_channel_requests = async function (req, res) {
    const user_id = res.locals.verified_user_id;
    const {channelId} = req.body;
  
    try {
      const channel = await Channel.findById(channelId).select("_id name user business").lean();
      if(!channel || channel.user !== user_id){
        return res.json({
          success: false,
          message: "You are not authorized to view this channel requests",
        });
      }
      const channelRequests = await ChannelMembership.find({
        channel:channelId,
        status:"request",
        user:{ $ne: null },
      }).populate("user", "_id name username logo color_logo");
  
  
      return res.json({
        success: true,
        message: "Fetched requests",
        requests: channelRequests,
      });
    } catch (error) {
      return res.json({
        success: false,
        message: "Something went wrong",
        error: error.message,
      });
    }
  };

  exports.fetch_all_channel_requests = async function (req, res) {
    const user_id = res.locals.verified_user_id;
  
    try {
      const channels = await Channel.find({user:user_id}).select("_id").lean();
      if(!channels.length){
        return res.json({
          success: false,
          message: "No channels found.",
        });
      }
      const channelIds = channels.map(channel => channel._id);
      const channelRequests = await ChannelMembership.find({
        channel:{$in:channelIds},
        status:"request",
        user:{ $ne: null },
      }).populate("user", "_id name username logo color_logo");
  
      return res.json({
        success: true,
        message: "Fetched requests",
        requests: channelRequests,
      });
    } catch (error) {
      return res.json({
        success: false,
        message: "Something went wrong",
        error: error.message,
      });
    }
  };
  

  exports.update_admin_params = async function (req, res) {
    const user_id = res.locals.verified_user_id;
    const {allowDM,talkToBrand} = req.body;
  
    try {
      const cacheKey = `${BUSINESS_PREFIX}${user_id}`;
      const business = await Business.findOne({user:user_id});
      if(!business){
        return res.json({
          success: false,
          message: "No business found.",
        });
      }
      if(!business.parameters){
        business.parameters = {};
      }
      business.parameters.allowDM = allowDM;
      business.parameters.talkToBrand = talkToBrand;
      await business.save();
      await rabbitmqService.publishInvalidation([cacheKey], "embed");
      return res.json({
        success: true,
        message: "Parameters updated successfully",
      });
    } catch (error) {
      return res.json({
        success: false,
        message: "Something went wrong",
        error: error.message,
      });
    }
  };

  exports.update_topic_summary_settings = async function (req, res) {
    const user_id = res.locals.verified_user_id;
    const {data, allowSummary} = req.body;

    if (!Array.isArray(data)) {
      return res.json({
        success: false,
        message: "Invalid data format. Expected an array of topic settings.",
      });
    }
  
    try {
      const business = await Business.findOne({user:user_id}).select("chatSummary");
      if(business){
        business.chatSummary = allowSummary;
        await business.save();
      }
      if (allowSummary && data.length > 0) {
        const bulkOps = data.map(({ topic, channel, summaryEnabled, summaryType, summaryTime }) => ({
          updateOne: {
            filter: { _id: topic, channel },
            update: {
              $set: {
                summaryEnabled,
                summaryType,
                summaryTime,
              },
            },
          },
        }));
  
        await Topic.bulkWrite(bulkOps);
      }
      return res.json({
        success: true,
        message: "Topic summary settings updated successfully",
      });
    } catch (error) {
      return res.json({
        success: false,
        message: "Something went wrong",
        error: error.message,
      });
    }
  };