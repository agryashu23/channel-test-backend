require("dotenv").config();
var mongoose = require("mongoose");
var User = mongoose.model("User");
var Business = mongoose.model("Business");
var Channel = mongoose.model("Channel");
var ChannelChat = mongoose.model("ChannelChat");

var Topic = mongoose.model("Topic");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { generateOTP } = require("../../utils/generateOTP");
const { generateDateTimePlus10Minutes } = require("../../utils/timeHelper");
const whois = require("whois-json");
const dns = require("dns").promises;
const axios = require("axios");
const sendEmail = require("../../coms/email/sendEmail");
const ChannelMembership = mongoose.model("ChannelMembership");
const TopicMembership = mongoose.model("TopicMembership");
const {linkUserMemberships} = require("../../utils/linkMembership");

const rabbitmqService = require("../services/rabbitmqService");
const redisService = require("../services/redisService");

const colorPalette = [
  "#C4C4C4",
  "#FFE48D",
  "#FBB28B",
  "#6BEDD6",
  "#FFABBF",
  "#D0BCFF",
  "#FFD270",
  "#96D7FF",
  "#FF8A8C",
  "#B2EE8F",
];

const EMBED_VERIFY_PREFIX = "embed:verify:";
const EMBED_API_PREFIX = "embed:api:";
const EMBED_LOGIN_PREFIX = "embed:login:";
const EMBED_DATA_PREFIX = "embed:data:";
const BUSINESS_PREFIX = "embed:business:";

const USER_PREFIX = "user:";

const TOPIC_PREFIX = "topic:";
const TOPICS_ALL_CHANNEL_PREFIX = "topics:all:channel:";
const TOPICS_MY_PREFIX = "topics:my:";
const TOPICS_MEMBERS_PREFIX = "topics:members:";


const CHANNEL_PREFIX = "channel:";
const CHANNELS_ALL_PREFIX = "channels:all:";
const CHANNELS_MY_PREFIX = "channels:my:";
const CHANNELS_MEMBERS_PREFIX = "channels:members:";

function getColorFromString(input = "") {
  if (!input) return colorPalette[0];

  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colorPalette.length;
  return colorPalette[index];
}

function generateApiKey(domain, user_id) {
  const randomPart = crypto.randomBytes(16).toString("hex");
  return `${domain}-${user_id}-${randomPart}`;
}

function extractDomainAndUserId(apiKey) {
  const parts = apiKey.split("-");

  if (parts.length < 3) {
    throw new Error("Invalid API key format");
  }
  const domain = parts[0];
  const user_id = parts[1];

  return { domain, user_id };
}

function getUserToken(user_data) {
  const token = jwt.sign(user_data, process.env.AUTH_SECRET, {
    expiresIn: process.env.AUTH_TOKEN_EXPIRY,
  });
  return token;
}

async function usernameCreate(email) {
  const maxLength = 10;
  const cleanedName = email
    .split("@")[0]
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.,\/\\]/g, "")
    .substring(0, maxLength);

  while (true) {
    const digits = Math.floor(100 + Math.random() * 900);
    const username = `${cleanedName}${digits}`;
    const user = await User.findOne({ username: username });
    if (!user) {
      return username;
    }
  }
}

const cleanDomain = (url) => {
  return url.replace(/(https?:\/\/)?(www\.)?/, "").split("/")[0];
};

exports.check_initial_api_key = async function (req, res) {
  try {
    const user_id = res.locals.verified_user_id;
    const business = await Business.findOne({
      user_id: user_id,
    }).lean();
    const cacheKey = `${EMBED_VERIFY_PREFIX}${user_id}`;
    const cached = await redisService.getCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    if (!business || !business.domain) {
      const response = {
        success: true,
        page: 0,
        domain: null,
        provider: null,
        verificationMethod: null,
        verificationToken: null,
        message: "Generate the API key.",
      };
      await redisService.setCache(cacheKey, response, 3600);
      return res.json(response);
    }
    const {
      domain,
      provider,
      verificationMethod,
      verificationToken,
      apiKey,
      isVerified,
    } = business;
    if (!isVerified) {
      const response = {
        success: true,
        page: 1,
        domain,
        provider,
        verificationMethod,
        verificationToken,
        message: "Generate the API key.",
      };
      await redisService.setCache(cacheKey, response, 3600);
      return res.json(response);
    }

    if (!apiKey) {
      const response = {
        success: true,
        page: 2,
        domain,
        provider,
        verificationMethod,
        verificationToken,
        apiKey: null,
        message: "Generate the API key.",
      };
      await redisService.setCache(cacheKey, response, 3600);
      return res.json(response);
    }
    const response = {
      success: true,
      page: 3,
      domain,
      provider,
      verificationMethod,
      verificationToken,
      apiKey,
      message: "API key already generated.",
    };
    await redisService.setCache(cacheKey, response, 3600);
    return res.json(response);
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Failed to check validity of API key." });
  }
};

exports.check_api_key_generated = async function (req, res) {
  try {
    const user_id = res.locals.verified_user_id;
    const business = await Business.findOne({ user_id: user_id }).lean();

    if (
      !business ||
      !business.domain ||
      !business.isVerified ||
      !business.apiKey
    ) {
      return res.json({
        success: false,
        message: "Generate the API key.",
      });
    }
    const response = {
      success: true,
      message: "API key already generated.",
    };
    return res.json(response);
  } catch (error) {
    return res.json({
      sucess: false,
      error: "Failed to check validity of API key.",
    });
  }
};

exports.check_domain_verification = async function (req, res) {
  try {
    const { domain } = req.body;
    const user_id = res.locals.verified_user_id;
    if (!domain || typeof domain !== "string") {
      return res.json({ message: "Invalid domain input." });
    }
    const cacheVerifyKey = `${EMBED_VERIFY_PREFIX}${user_id}`;
    const newDomain = cleanDomain(domain);
    if (!newDomain) {
      return res.json({
        available: false,
        message: "Domain format is incorrect.",
      });
    }
    const existingBusiness = await Business.findOne({ domain: newDomain });
    if (
      existingBusiness &&
      (existingBusiness.user_id.toString() !== user_id.toString() ||
        existingBusiness.isVerified)
    ) {
      return res.json({
        available: false,
        message: "Domain is already registered.",
      });
    }
    const verificationToken = crypto.randomBytes(16).toString("hex");

    const result = await whois(newDomain);

    if (!result || Object.keys(result).length === 0) {
      return res.json({
        sucess: false,
        message: "Domain is invalid or cannot be verified.",
      });
    }
    const providerData = result.registrar ? result.registrar : null;
    const business = new Business({
      domain: newDomain,
      user_id: user_id,
      verificationToken: verificationToken,
      provider: providerData,
    });

    await business.save();
    await rabbitmqService.publishInvalidation(
      [cacheVerifyKey],
      "embed"
    );
    res.json({
      success: true,
      message: "Domain is available for registration.",
      token: verificationToken,
      provider: providerData,
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

exports.download_verification_file = async function (req, res) {
  try {
    const verificationCode = req.query.token;
    if (!verificationCode) {
      return res.status(400).json({ error: "Missing verification token" });
    }
    console.log("Received verification token:", verificationCode);
    const filePath = path.join(os.tmpdir(), "channels-verification.txt");
    fs.writeFileSync(filePath, `Verification Code: ${verificationCode}`);

    console.log("File created at:", filePath);
    res.download(filePath, "channels-verification.txt", (err) => {
      if (err) {
        console.error("Download Error:", err);
        res.status(500).json({ error: "Failed to generate verification file" });
      }
      fs.unlinkSync(filePath);
    });
  } catch (error) {
    console.error("File Generation Error:", error);
    res.status(500).json({ error: "Failed to generate verification file" });
  }
};

exports.domain_verification_method = async function (req, res) {
  try {
    const { verificationMethod } = req.body;
    const user_id = res.locals.verified_user_id;
    const business = await Business.findOne({ user_id: user_id });
    const cacheKey = `${EMBED_VERIFY_PREFIX}${user_id}`;
    const cacheKey2 = `${EMBED_API_PREFIX}${apiKey}:${domain}`;
    if (!business) {
      return res.json({ success: false, error: "Invalid User" });
    }
    if (business.isVerified) {
      return res.json({
        success: false,
        message: "Domain is already verified.",
      });
    }
    let verified = false;
    const domain = business.domain;
    switch (verificationMethod) {
      case "dns":
        try {
          const records = await dns.resolveTxt(domain);
          const flatRecords = records
            .flat()
            .map((r) => r.replace(/"/g, "").trim());

          console.log("Resolved TXT Records:", flatRecords);
          verified = flatRecords.includes(
            `channels-verification=${business.verificationToken}`
          );
        } catch (error) {
          console.error("DNS resolution error:", error);
          verified = false;
        }
        break;

      case "file":
        try {
          const response = await axios.get(
            `https://${domain}/channels-verification.txt`
          );
          verified =
            response.data.trim() ===
            "Verification Code: " + business.verificationToken;
        } catch (error) {
          console.error("DNS resolution error:", error);
          verified = false;
        }
        break;

      case "meta":
        try {
          const response = await axios.get(`https://${domain}`);
          verified = response.data.includes(
            `<meta name="channels-verification" content="${business.verificationToken}"/>`
          );
        } catch (error) {
          verified = false;
        }
        break;

      default:
        return res.json({
          success: false,
          error: "Invalid verification method.",
        });
    }
    if (!verified) {
      return res.json({
        message:
          "Verification failed. Choose correct verification method and try again in few minutes.",
      });
    }
    business.isVerified = true;
    const apiKey = generateApiKey(business.domain, user_id);
    business.apiKey = apiKey;
    business.verificationMethod = verificationMethod;
    await business.save();
    await rabbitmqService.publishInvalidation(
      [cacheKey,cacheKey2],
      "embed"
    );
    res.json({
      success: true,
      message: "Verification successfull. API key is now active.",
      domain,
      apiKey,
    });
  } catch (error) {
    console.error("Error verifying domain:", error);
    return res.json({ error: "Internal server error" });
  }
};

exports.verify_api_key = async function (req, res) {
  try {
    const { apiKey, domain } = req.body;
    if (!apiKey || !domain) {
      return res.json({ error: "API Key and domain are required" });
    }
    const cacheKey = `${EMBED_API_PREFIX}${apiKey}:${domain}`;
    const cached = await redisService.getCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    const business = await Business.findOne({ apiKey }).lean();
    if (!business) {
      const response = { valid: false, error: "Invalid API key" };
      return res.json(response);
    }
    if (business.domain !== domain) {
      const response = {
        valid: false,
        error: "API key does not match this domain",
      };
      return res.json(response);
    }
    const response = { valid: true, user_id: business.user_id };
    await redisService.setCache(cacheKey, response, 7200);
    return res.json(response);
  } catch (err) {
    console.error("Error in verifying API key:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


exports.auto_login = async function (req, res) {
  try {
    const { domain, email, apiKey, channelName, autoLogin,topicName } = req.body;

    if (!apiKey || !domain || !email) {
      return res.json({
        success: false,
        message: "API Key, domain, and email are required.",
      });
    }
    const normalizedEmail = email.toLowerCase().trim();
    const cacheKey = `${EMBED_LOGIN_PREFIX}${normalizedEmail}:${domain}:${apiKey}:${channelName}`;
    const cachedVal = await redisService.getCache(cacheKey);
    if (cachedVal) {
      return res.status(200).json(cachedVal);
    }

    const business = await Business.findOne({ apiKey }).lean();
    if (!business || !business.isVerified) {
      return res.json({ success: false, error: "Invalid API key or domain is not verified." });
    }
    let user = await User.findOne({ email: normalizedEmail });
    
    if (business.autoLogin && (autoLogin === true || autoLogin === "true")) {
      if (!user) {
        const username = await usernameCreate(normalizedEmail);
        const assignedColor = getColorFromString(username);
        user = await User.create({
          email: normalizedEmail,
          username,
          color_logo: assignedColor,
          verified_domains: [domain],
        });
        responseMessage = "Registered and auto-logged in.";
      } else {
        if (!Array.isArray(user.verified_domains)) user.verified_domains = [];
        if (!user.verified_domains.includes(domain)) {
          user.verified_domains.push(domain);
        }
        responseMessage = "Auto-logged in.";
      }
    } else {
      if (!user) {
        return res.json({
          success: false,
          error: "User not registered or domain not verified.",
        });
      }
      if (
        !Array.isArray(user.verified_domains) ||
        !user.verified_domains.includes(domain)
      ) {
        return res.json({
          success: false,
          error: "Domain is not verified for this user.",
        });
      }
      responseMessage = "Logged in successfully.";
    }
    const joinSelectedTopic=false;
    const cacheKeys = await linkUserMemberships(user);
    if(business.autoLogin && (autoLogin === true || autoLogin === "true")){
      const channelData = await Channel.findOne({
        name: channelName,
        user: business.user_id,
      }).populate({path:"topics",select:"_id name"}).lean();
      if (!channelData) {
        return res.json({ success: false, error: "Channel not found." });
      }
      const channelId = channelData?._id;
      const channelMembership = await ChannelMembership.findOne({channel:channelId,user:user._id});
      
      if(business.loginControl === "direct"){
        if (!channelMembership) {
          await ChannelMembership.create({ channel: channelId, user: user._id, business: business._id,email:normalizedEmail, status: "joined" });
        } else if (channelMembership.status === "request") {
          await ChannelMembership.updateOne({ _id: channelMembership._id }, { status: "joined",user:user._id,business:business._id });
        }
        cacheKeys.push(`${CHANNELS_MEMBERS_PREFIX}${channelId}`);
        const topicData = channelData.topics.find(t => t.name === topicName);
        if (topicData) {
          const topicMembership = await TopicMembership.findOne({ email: normalizedEmail, topic: topicData._id });
          if (!topicMembership) {
            await TopicMembership.create({user:user._id, email: normalizedEmail, topic: topicData._id, business: business._id, status: "joined" });
            joinSelectedTopic = true;
          } else if (topicMembership.status === "request") {
            await TopicMembership.updateOne({ _id: topicMembership._id }, { status: "joined",user:user._id,business:business._id });
          }
          cacheKeys.push(`${TOPICS_MEMBERS_PREFIX}${topicData._id}`);
        }
      }
      else{
        if (!channelMembership) {
          const status = channelData.visibility === "invite" ? "request" : "joined";
          await ChannelMembership.create({ channel: channelId, user: user._id,email:normalizedEmail, business: business._id, status });
          cacheKeys.push(`${CHANNELS_MEMBERS_PREFIX}${channelId}`);
        }
        const topicData = channelData.topics.find(t => t.name === topicName);
        if (topicData) {
          const topicMembership = await TopicMembership.findOne({ email: normalizedEmail, topic: topicData._id });
          if (!topicMembership) {
            if (topicData.visibility === "anyone") {
              await TopicMembership.create({user:user._id, email: normalizedEmail, topic: topicData._id, status: "joined",business:business._id });
              joinSelectedTopic = true;
            } else if (topicData.visibility === "invite") {
              await TopicMembership.create({user:user._id, email: normalizedEmail, topic: topicData._id, status: "request",business:business._id });
            }
            cacheKeys.push(`${TOPICS_MEMBERS_PREFIX}${topicData._id}`);
          }
        }
      }
    }

    await rabbitmqService.publishInvalidation(cacheKeys, "channel");
    const userData = {
      _id: user._id,
      name: user.name || null,
      email: user.email,
      username: user.username,
      business: user.business || null,
    };
    const newToken = getUserToken(userData);
    const responseData = {
      success: true,
      token: newToken,
      user: userData,
      message: responseMessage, 
      joinTopic:joinSelectedTopic,
    };

    await redisService.setCache(cacheKey, responseData, 1200);
    return res.status(200).json(responseData);
  } catch (error) {
    console.error("❌ Error in auto-login:", error);
    return res.json({ success: false, error: "Internal server error" });
  }
};


exports.login_embed = async function (req, res) {
  const { email } = req.body;
  const otp = generateOTP();
  const otp_expiry = generateDateTimePlus10Minutes();
  if (otp) {
    const subject = "Welcome! to Channels.Social";
    const message = `Welcome to Channels.Social. To ensure the security of your account, we require you to verify your email address.\n\nYour OTP (One Time Password) for verification is: ${otp}\n\nPlease enter this OTP in the provided field on our app to complete the verification process.`;
    await sendEmail(email, subject, message);
    res.json({
      success: true,
      message: "otp sended to the email",
      otp: otp,
    });
  }
};

exports.verify_login_embed = async function (req, res) {
  try {
    const { email, domain, channel } = req.body;
    if (!email || !domain) {
      return res.json({
        success: false,
        message: "Email and domain are required",
      });
    }

    const username = await usernameCreate(email);
    const assignedColor = getColorFromString(username);
    let user = await User.findOne({ email });
    const isNewUser = !user;
    if (isNewUser) {
      user = new User({
        email,
        username,
        color_logo: assignedColor,
        verified_domains: [domain],
      });
    } else {
      if (!Array.isArray(user.verified_domains)) user.verified_domains = [];
      if (!user.verified_domains.includes(domain)) {
        user.verified_domains.push(domain);
      }
    }
    await user.save();
    const cacheKeys2 = await linkUserMemberships(user);
    const cacheKeys = [...cacheKeys2, `${USER_PREFIX}${user._id}`];
    if(channel){
      const channelMembership = await ChannelMembership.findOne({channel:channel,user:user._id,status:"joined"});
      if(!channelMembership){
        const channelData = await Channel.findById(channel);
        if(channelData && channelData.visibility === "public"){
          await ChannelMembership.create({channel:channel,user:user._id,email:user.email,business:channelData.business,status:"joined"});
          cacheKeys.push(`${CHANNELS_MEMBERS_PREFIX}${channel}`);
        }
        else if(channelData && channelData.visibility === "invite"){
          await ChannelMembership.create({channel:channel,user:user._id,email:user.email,business:channelData.business,status:"request"});
          cacheKeys.push(`${CHANNELS_MEMBERS_PREFIX}${channel}`);
        }
      }
    }
    if (cacheKeys.length) {
      await redisService.delCache(`${CHANNELS_MEMBERS_PREFIX}${channel}`);
      await rabbitmqService.publishInvalidation(cacheKeys, "channel");
    }
    const token = getUserToken({
      _id: user._id,
      email: user.email,
      username: user.username,
      business: user.business || null,
    });

    const userResponse = {
      _id: user._id,
      email: user.email,
      username: user.username,
      color_logo: user.color_logo,
      verified_domains: user.verified_domains,
      business: user.business || null,
    };

    return res.json({
      success: true,
      message: isNewUser ? "Signup successful" : "Login successful",
      token,
      user: userResponse,
    });
  } catch (err) {
    console.error("Error in verify_login_embed:", err);
    return res.json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
};

exports.embed_google_auth = async function (req, res) {
  try {
    const { name = "", email, domain, channel } = req.body;
    if (!email || !domain) {
      return res.json({
        success: false,
        message: "Email and domain are required",
      });
    }

    const username = await usernameCreate(email);
    const assignedColor = getColorFromString(username);

    let user = await User.findOne({ email });
    let isNewUser = !user;
    if (!user) {
      user = new User({
        email,
        username,
        name,
        color_logo: assignedColor,
        verified_domains: [domain],
      });
    } else {
      if (!Array.isArray(user.verified_domains)) user.verified_domains = [];
      if (!user.verified_domains.includes(domain)) {
        user.verified_domains.push(domain);
      }
    }
    await user.save();
    const cacheKeys2 = await linkUserMemberships(user);
    const cacheKeys = [...cacheKeys2, `${USER_PREFIX}${user._id}`];
    if(channel){
      const channelMembership = await ChannelMembership.findOne({channel:channel,user:user._id,status:"joined"});
      if(!channelMembership){
        const channelData = await Channel.findById(channel).select("topics business visibility").populate({path:"topics",select:"_id name visibility"}).lean();
        if(channelData && channelData.visibility === "public"){
          await ChannelMembership.create({channel:channel,user:user._id,email:user.email,business:channelData.business,status:"joined"});
          const publicTopics = channelData.topics.filter(t => t.visibility === "anyone");
          const topicIds = publicTopics.map(t => t._id);
          let topicMemberships = [];
          if (topicIds.length) {
            const bulkOps = topicIds.map(topicId => {
              const membershipDoc = {
                topic: topicId,
                user: user._id,
                channel: channelData._id,
                business: channelData.business,
                status: "joined",
              };
              topicMemberships.push(membershipDoc);
              return { insertOne: { document: membershipDoc } };
            });

            await TopicMembership.bulkWrite(bulkOps);
            const topicCacheKeys = topicIds.map(id => `${TOPICS_MEMBERS_PREFIX}${id}`);
            cacheKeys.push(...topicCacheKeys);
          }
          cacheKeys.push(`${CHANNELS_MEMBERS_PREFIX}${channel}`);
        }
        else if(channelData && channelData.visibility === "invite"){
          await ChannelMembership.create({channel:channel,email:user.email, user:user._id,business:channelData.business,status:"request"});
          cacheKeys.push(`${CHANNELS_MEMBERS_PREFIX}${channel}`);
        }
      }
    }
    const user_data = {
      _id: user._id,
      name: user.name,
      email: user.email,
      username: user.username,
      business: user.business || null,
    };
    const token = getUserToken(user_data);

    if (cacheKeys.length) {
      await redisService.delCache(`${CHANNELS_MEMBERS_PREFIX}${channel}`);
      await rabbitmqService.publishInvalidation(cacheKeys, "channel");
    }
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      username: user.username,
      color_logo: user.color_logo,
      verified_domains: user.verified_domains,
      business: user.business || null,
    };

    return res.json({
      success: true,
      message: isNewUser ? "Signup successful" : "User auth successful",
      token,
      user: userResponse,
      isLogin: !isNewUser,
    });
  } catch (err) {
    console.error("❌ Google Auth Error:", err);
    return res.json({
      success: false,
      message: "Google auth failed",
      error: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
};

exports.generate_embed_data = async function (req, res) {
  try {
    const { apiKey, domain, selectedChannel, selectedTopic, echannels,email } =
      req.body;
    let channels = [];

    if (Array.isArray(echannels)) {
      channels = echannels;
    } else if (typeof echannels === "string") {
      try {
        channels = JSON.parse(echannels);
        if (!Array.isArray(channels)) {
          return res.json({ success: false, error: "Invalid channels format" });
        }
      } catch (err) {
        return res.json({ success: false, error: "Invalid channels format" });
      }
    }

    const cacheKey = `${EMBED_DATA_PREFIX}${apiKey}:${domain}:${selectedChannel}:${selectedTopic}:${channels.join(",")}`;
    const cachedVal = await redisService.getCache(cacheKey);
    if (cachedVal) {
      return res.json(cachedVal);
    }

    if (!apiKey || !domain) {
      return res.json({ error: "Api Key and domain are required" });
    }

    const business = await Business.findOne({apiKey:apiKey}).populate({path:"user",select:"_id username"}).lean();
    if(!business){
      return res.json({ error: "Invalid api key" });
    }

    const filter = channels.length
      ? { name: { $in: channels },business:business._id }
      : { business:business._id };

    let allChannels = await Channel.find(filter).select("_id name business user").lean();

    if (!allChannels.length && channels.length) {
      allChannels = await Channel.find({ business:business._id }).select("_id name business user").lean();
    }
    if (!allChannels.length) {
      return res.json({ error: "No channels found" });
    }
    const selectedChannelData =
      allChannels.find((ch) => ch.name === selectedChannel) || allChannels[0];

    const selectedChannelId = selectedChannelData?._id;
    const selectedTopicData = await Topic.findOne({
      name: selectedTopic,
      channel: selectedChannelId,
      business: business._id,
    }).select("_id").lean();

    const selectedTopicId = selectedTopicData?._id;
    const topicMembership = selectedTopicId
      ? await TopicMembership.findOne({
          email: email,
          topic: selectedTopicId,
          status: "joined",
          user:{ $ne: null },
        }).lean()
      : null;

    const responseData = {
      success: true,
      channels: allChannels,
      selectedChannel: selectedChannelId,
      selectedTopic: selectedTopicId,
      username: business.user.username,
      membership: topicMembership?true:false,
    };
    await redisService.setCache(cacheKey, responseData, 600);
    return res.json(responseData);
  } catch (err) {
    console.error("❌ Error in generating embed data:", err);
    return res.json({ error: "Internal server error", message: err.message });
  }
};

