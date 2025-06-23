require("dotenv").config();
var mongoose = require("mongoose");
var User = mongoose.model("User");
var Channel = mongoose.model("Channel");
const jwt = require("jsonwebtoken");
const { isValidEmail, isEmptyString } = require("../../utils/stringMethods");
const { generateOTP } = require("../../utils/generateOTP");
const { generateDateTimePlus10Minutes } = require("../../utils/timeHelper");
const { disallowedUsernames } = require("../../utils/checkUsername");
const sendEmail = require("../../coms/email/sendEmail");
const sendWelcomeEmail = require("../../coms/email/sendWelcomeEmail");
const bcrypt = require("bcryptjs");
const saltRounds = 10;
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const redisService = require('../services/redisService');
const rabbitmqService = require('../services/rabbitmqService');
const ChannelMembership = mongoose.model("ChannelMembership");
const TopicMembership = mongoose.model("TopicMembership");
const {linkUserMemberships} = require("../../utils/linkMembership");

const {
  uploadSingleImage,
  uploadSingleImageLogo,
  uploadMultipleImages,
} = require("../aws/uploads/Images");
const { v4: uuidv4 } = require("uuid");
const sendWhatsAppAuthNotification = require("../../coms/whatsApp/whatsAppAuth");

const colorPalette = [
  "#FDBD46",
  "#43D392",
  "#964BFF",
  "#78DEDB",
  "#EB849D",
  "#BBA3F3",
  "#FD8940",
  "#66BCF1",
  "#EF5A5D",
  "#96CA78",
];

const USER_PUBLIC_FIELDS = {
  name: 1,
  username: 1,
  description: 1,
  links: 1,
  email: 1,
  location: 1,
  contact: 1,
  customText: 1,
  customUrl: 1,
  otherLink: 1,
  logo: 1,
  business:1,
  color_logo: 1,
  imageCards: 1,
  isBrand: 1,
  verified_domains: 1,
};

const USER_PREFIX = 'user:';
const USER_DETAILS_PREFIX = 'user:details:';
const USER_VERIFY = 'user:verify:';
const CHANNELS_MEMBERS_PREFIX = "channels:members:";
const TOPICS_MEMBERS_PREFIX = "topics:members:";


function getColorFromString(input = "") {
  if (!input) return colorPalette[0];

  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colorPalette.length;
  return colorPalette[index];
}

function getUserToken(user_data) {
  const token = jwt.sign(user_data, process.env.AUTH_SECRET, {
    expiresIn: process.env.AUTH_TOKEN_EXPIRY,
  });
  return token;
}

async function createHashPassword(password) {
  try {
    return await bcrypt.hash(password, saltRounds);
  } catch (err) {
    console.error(err.message);
    throw err;
  }
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



exports.register = function (req, res) {
  const { email } = req.body;
  User.findOne({ email: email }).then((user) => {
    if (user) {
      res.json({
        success: false,
        message: "User is already registered, please login",
      });
    } else {
      const otp = generateOTP();
      const otp_expiry = generateDateTimePlus10Minutes();
      if (otp) {
        const subject = "Welcome! to Channels.Social";
        const message = `Welcome to Channels.Social. To ensure the security of your account, we require you to verify your email address.\n\nYour OTP (One Time Password) for verification is: ${otp}\n\nPlease enter this OTP in the provided field on our app to complete the verification process.`;
        sendEmail(email, subject, message);
        res.json({
          success: true,
          message: "otp sended to the email",
          otp: otp,
          user,
        });
      }
    }
  });
};

exports.login = async function (req, res) {
  const { email, password } = req.body;
  console.log(email);
  if (!email || typeof password !== "string") {
    return res.json({
      success: false,
      message: "Bad request: Invalid credentials.",
    });
  }
  try {
    const user = await User.findOne({ email: email }).lean();
    if (!user) {
      return res.json({
        success: false,
        message: "User not registered, please register",
      });
    }
    if (!user.password) {
      return res.json({
        success: false,
        message: "No password set or forgot. Try google signing.",
      });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.json({ success: false, message: "Password is incorrect" });
    }
    const cacheKeys = await linkUserMemberships(user);
    if(cacheKeys.length>0){
      await rabbitmqService.publishInvalidation(cacheKeys,'membership');
    }
    const user_data = {
      _id: user._id,
      name: user.name,
      email: user.email,
      business: user.business || null,
    };

    let token = getUserToken(user_data);

    res.json({
      success: true,
      message: "Logged in successfully",
      token: token,
      user: user,
    });
  } catch (error) {
    res
      .json({ success: false, message: "Error in logging. Please try again." });
  }
};

exports.verify_auth = async function (req, res, next) {
  try {
    const { name, email, password } = req.body;
    const username = await usernameCreate(email);
    const hashPassword = await createHashPassword(password);
    const assignedColor = getColorFromString(username);
    const user_data = {
      name: name,
      email: email,
      password: hashPassword,
      username: username,
      color_logo: assignedColor,
    };

    const createdUser = await User.create(user_data);
    const user = await User.findById(createdUser._id).select(USER_PUBLIC_FIELDS).lean();
    if (user) {
      const userId = user._id;
      const user_data = {
        _id: userId,
        name: user.name,
        email: user.email,
        username: user.username,
        business: user.business || null,
      };
      let token = getUserToken(user_data);
      const cacheKeys = await linkUserMemberships(user);
      if(cacheKeys.length>0){
        await rabbitmqService.publishInvalidation(cacheKeys,'membership');
      }
      res.json({
        success: true,
        message: "Registration successful",
        token: token,
        user: user,
      });
    } else {
      res.json({ success: false, message: "Registration unsuccessful" });
    }
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: "Registration unsuccessful" });
  }
};

exports.google_auth = async function (req, res, next) {
  try {
    const { name, email, pageIds } = req.body;
    const username = await usernameCreate(email);
    const assignedColor = getColorFromString(username);
    const user_data = {
      name: name,
      email: email,
      username: username,
      color_logo: assignedColor,
      
    };
    const user = await User.findOne({ email: email },USER_PUBLIC_FIELDS).lean();
    if (user) {
      const user_data = {
        _id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        business: user.business || null,
      };
      let token = getUserToken(user_data);
      const cacheKeys = await linkUserMemberships(user);
      if(cacheKeys.length>0){
        await rabbitmqService.publishInvalidation(cacheKeys,'membership');
      }
      return res.json({
        success: true,
        message: "User auth successful",
        token: token,
        user: user,
        islogin: true,
      });
    } else {
      const newCreatedUser = await User.create(user_data);
      const newUser = await User.findById(newCreatedUser._id).select(USER_PUBLIC_FIELDS).lean();
      if (newUser) {
        const userId = newUser._id;
        const user_data = {
          _id: userId,
          name: newUser.name,
          email: newUser.email,
          username: newUser.username,
        };
        let token = getUserToken(user_data);
        const cacheKeys = await linkUserMemberships(newUser);
        if(cacheKeys.length>0){
          await rabbitmqService.publishInvalidation(cacheKeys,'membership');
        }
        return res.json({
          success: true,
          message: "User auth successful",
          token: token,
          user: newUser,
          islogin: false,
        });
      } else {
        return res.json({ success: false, message: "Google auth failed" });
      }
    }
  } catch (err) {
    console.error(err);
    res.json({
      success: false,
      message: "Google auth failed",
      error: err.message,
    });
  }
};

exports.forgotPassword = async function (req, res) {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ success: false, message: "User is not registered. Please register." });
    }
    const resetToken = crypto.randomBytes(20).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();
    const subject = "Password Reset";
    const message =
      `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n` +
      `Please click on the following link, or paste this into your browser to complete the process:\n\n` +
      `https://channels.social/reset-password/${resetToken}\n\n` +
      `If you did not request this, please ignore this email and your password will remain unchanged.\n`;
    sendEmail(email, subject, message);
    res.json({
      success: true,
      message: "Reset Password mail has been sent to your mail Id.",
    });
  } catch (error) {
    console.error("Error during password reset:", error);
    res.json({ message: "Error resetting password" });
  }
};
exports.resetPassword = async function (req, res) {
  const { token, password } = req.body;
  const hashPassword = await createHashPassword(password);
  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user) {
      return res.json({
        message: "Password reset token is invalid or has expired.",
      });
    }
    user.password = hashPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    res.json({ message: "Your password has been updated. Please Login" });
  } catch (error) {
    console.error("Failed to reset password:", error);
    res.json({ message: "Failed to reset password." });
  }
};
exports.check_username = async function (req, res) {
  const { username } = req.body;
  try {
    if (disallowedUsernames.includes(username)) {
      return res.json({ success: false, message: "Not Available" });
    }
    const user = await User.findOne({ username: username });
    if (!user || user.username.toString() === username) {
      return res.json({ success: true, message: "Username Available" });
    }
    res.json({ success: false, message: "Error Available" });
  } catch (error) {
    console.error("Failed to search username:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to search username" });
  }
};
exports.check_username_profile = async function (req, res) {
  const { username } = req.body;
  const user_id = res.locals.verified_user_id;
  try {
   
    const user = await User.findOne({ username: username });
    if (!user) {
      return res.json({ success: true, message: "Username Available" });
    } else if (user._id.toString() === user_id) {
      return res.json({ success: true, message: "Username Available" });
    }
    return res.json({ success: false, message: "Error Available" });
  } catch (error) {
    console.error("Failed to search username:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to search username" });
  }
};

exports.username_exist = async function (req, res) {
  const { username } = req.body;
  try {
    const cacheKey = `${USER_VERIFY}${username}`;
    const usernameCacheExist = await redisService.getCache(cacheKey);
    if(usernameCacheExist){
      return res.json(usernameCacheExist);
    }

    const user = await User.findOne({ username: username });
    const responseData = {
      success: user !== null,
      message: user ? "Username Available" : "Username unavailable"
    };

    await redisService.setCache(cacheKey, responseData, 7200);
    res.json(responseData);
  } catch (error) {
    console.error("Failed to search username:", error);
    res.json({ success: false, message: "Failed to search username" });
  }
};

exports.claimUserName = async function (req, res) {
  const { username } = req.body;
  const user_id = res.locals.verified_user_id;
  try {
    if (disallowedUsernames.includes(username)) {
      return res.json({ success: false, message: "Not Available" });
    }
    const user = await User.findOne({ username });
    if (!user) {
      const updatedUser = await User.findByIdAndUpdate(
        user_id,
        { username },
        { new: true }
      );
      if (updatedUser) {
        return res.json({
          success: true,
          message: "Username claimed successfully.",
        });
      } else {
        return res.json({
          success: false,
          message: "Error while claiming username",
        });
      }
    } else {
      res.json({ success: false, message: "Username already exists." });
    }
  } catch (error) {
    console.error("Failed to claim username:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to claim username" });
  }
};

exports.updateLinks = async function (req, res) {
  const { links, otherLink } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    const updatedUser = await User.findByIdAndUpdate(
      user_id,
      { links, otherLink },
      { new: true }
    );
    if (updatedUser) {
      res.json({ success: true, message: "Links updated successfully." });
    } else {
      res.json({ success: false, message: "Error while updating links." });
    }
  } catch (error) {
    console.error("Failed to update user links:", error);
    res.json({ success: false, message: "Failed to update user links." });
  }
};

exports.updateDetailsProfile = async function (req, res) {
  const { contact, location, description, customText, customUrl } = req.body;
  const user_id = res.locals.verified_user_id;
  try {
    let logoUrl = null;
    const cacheKey = `${USER_PREFIX}${user_id}`;
    if (req.file) {
      logoUrl = await uploadSingleImageLogo(req.file.buffer, "logo");
    }
    const updatedUser = await User.findByIdAndUpdate(
      user_id,
      {
        contact,
        location,
        description,
        customText,
        customUrl,
        logo: logoUrl,
      },
      { new: true, projection: USER_PUBLIC_FIELDS }
    );
    if (updatedUser) {
      await rabbitmqService.publishInvalidation([cacheKey],'user');
      res.json({
        success: true,
        message: "Profile updated successfully.",
        user: updatedUser,
      });
    } else {
      res.json({ success: false, message: "Error while updating profile." });
    }
  } catch (error) {
    console.error("Failed to update profile:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update profile." });
  }
};

exports.updateProfile = async function (req, res) {
  const {
    name,
    username,
    contact,
    location,
    description,
    customText,
    customUrl,
    logo,
    otherLink,
  } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    
    const cacheKey = `${USER_PREFIX}${user_id}`;
    const usernameCacheKey = `${USER_VERIFY}${username}`;
    const userDetailsCacheKey = `${USER_DETAILS_PREFIX}${username}`;

    let logoUrl = logo;
    if (req.files["image"]) {
      const imageFile = req.files["image"][0];
      logoUrl = await uploadSingleImageLogo(imageFile.buffer, "logo");
    }
    const links = JSON.parse(req.body.links || "[]");
    const imageCards = JSON.parse(req.body.imageCards || "[]");
    if (req.files["files"]) {
      const uploadedImageUrls = await uploadMultipleImages(
        req.files["files"],
        "profileCards"
      );

      let uploadIndex = 0;
      for (let i = 0; i < imageCards.length; i++) {
        if (imageCards[i].source === "upload") {
          imageCards[i] = {
            id: uuidv4(),
            url: uploadedImageUrls[uploadIndex],
            source: "internet",
          };
          uploadIndex++;
        }
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      user_id,
      {
        name,
        links,
        username,
        otherLink,
        imageCards,
        contact,
        location,
        description,
        customText,
        customUrl,
        logo: logoUrl,
      },
      { new: true, projection: USER_PUBLIC_FIELDS }
    );

    if (updatedUser) {
      if(username){
        await rabbitmqService.publishInvalidation([usernameCacheKey,cacheKey,userDetailsCacheKey],'user');
      }
      else{
        await rabbitmqService.publishInvalidation([cacheKey],'user');
      }
      res.json({
        success: true,
        message: "Profile updated successfully.",
        user: updatedUser,
      });
    } else {
      res.json({ success: false, message: "Error while updating profile." });
    }
  } catch (error) {
    console.error("Failed to update profile:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update profile." });
  }
};

exports.fetch_user = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  if (!user_id) {
    return res.json({ success: false, message: "User ID is required." });
  }
  
  try {
    const cacheKey = `${USER_PREFIX}${user_id}`;
    const cachedUser = await redisService.getCache(cacheKey);
    if(cachedUser){
      return res.json({ success: true, user: cachedUser });
    }

    const user = await User.findById(user_id,USER_PUBLIC_FIELDS).lean();
    if (user) {
      await redisService.setCache(cacheKey, user, 7200);
      res.json({ success: true, user: user });
    } else {
      res.json({ success: false, message: "User not found." });
    }
  } catch (error) {
    console.error("Failed to fetch profile:", error);
    res.json({ success: false, message: "Failed to fetch profile." });
  }
};

exports.fetch_user_details = async function (req, res) {
  const { username } = req.body;
  if (!username) {
    return res.json({ success: false, message: "Username is required." });
  }
  try {
    const cacheKey = `${USER_DETAILS_PREFIX}${username}`;
    const cachedUser = await redisService.getCache(cacheKey);
    if(cachedUser){
      return res.json({ success: true, user: cachedUser });
    }
    const user = await User.findOne({ username: username },USER_PUBLIC_FIELDS).lean();
    if (user) {
      await redisService.setCache(cacheKey, user, 3600);
      res.json({ success: true, user: user });
    } else {
      res.json({ success: false, message: "User not found." });
    }
  } catch (error) {
    console.error("Failed to fetch profile:", error);
    res.json({ success: false, message: "Failed to fetch profile." });
  }
};

exports.update_whatsapp_number = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { number } = req.body;
  if (!user_id) {
    return res.json({ success: false, message: "User ID is required." });
  }
  if (number === "") {
    return res.json({ success: false, message: "Number is required." });
  }
  try {
    const otp = generateOTP();
    
    const sendData = await sendWhatsAppAuthNotification(number, {
      code: otp,
    });
    if (sendData.success) {
      return res.json({
        success: true,
        message: "OTP sent via WhatsApp successfully.",
        otp: otp,
      });
    } else {
      return res.json({
        success: false,
        message:
          "Failed to send message. Ensure the number is registered on WhatsApp.",
      });
    }
  } catch (error) {
    res.json({ success: false, message: "Incorrect mobile number." });
  }
};
exports.save_whatsapp_number = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { number } = req.body;
  if (!user_id) {
    return res.json({ success: false, message: "User ID is required." });
  }
  if (number === "") {
    return res.json({ success: false, message: "Number is required." });
  }
  try {
    const user = await User.findById(user_id);
    const cacheKey = `${USER_PREFIX}${user_id}`;
    const userDetailsCacheKey = `${USER_DETAILS_PREFIX}${user.username}`;
    user.contact = number;
    user.contact_verified = true;
    await user.save();
    await rabbitmqService.publishInvalidation([cacheKey,userDetailsCacheKey],'user');
    return res.json({
      success: true,
      message: "WhatsApp number saved.",
    });
  } catch (error) {
    res.json({ success: false, message: "Failed to verify. Try again..." });
  }
};

// exports.get_password = async function (req, res) {
//   const { pass } = req.body;
//   try {
//     const newpass = await createHashPassword(pass);
//     res.json({ success: true, message: "User not found.", password: newpass });
//   } catch (error) {
//     console.error("Failed to fetch profile:", error);
//     res.json({ success: false, message: "Failed to fetch profile." });
//   }
// };
