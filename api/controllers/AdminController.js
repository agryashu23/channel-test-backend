require("dotenv").config();
var mongoose = require("mongoose");
var Admin = mongoose.model("Admin");
var User = mongoose.model("User");
var Business = mongoose.model("Business");
const Channel = mongoose.model("Channel");
const Topic = mongoose.model("Topic");
const ChannelMembership = mongoose.model("ChannelMembership");
const TopicMembership = mongoose.model("TopicMembership");
const {
  uploadSingleImage,
  uploadMultipleImages,
} = require("../aws/uploads/Images");

// exports.post_curation_picks = async function (req, res) {
//   const { curations } = req.body;
//   try {
//     let admin = await Admin.findOne({});
//     if (!admin) {
//       admin = new Admin();
//     }
//     admin.curation_picks = curations;
//     await admin.save();
//     return res.json({
//       success: true,
//       message: "Curation picks updated successfully.",
//       curations: admin.curation_picks,
//     });
//   } catch (error) {
//     console.error("Failed to update curation picks:", error);
//     return res
//       .status(500)
//       .json({ success: false, message: "Failed to update curation picks" });
//   }
// };
// exports.post_banner_cards = async function (req, res) {
//   try {
//     if (req.files["files"]) {
//       const uploadedImageUrls = await uploadMultipleImages(
//         req.files["files"],
//         "profileCards"
//       );

//       let uploadIndex = 0;
//       for (let i = 0; i < imageCards.length; i++) {
//         if (imageCards[i].source === "upload") {
//           imageCards[i] = {
//             id: uuidv4(),
//             url: uploadedImageUrls[uploadIndex],
//             source: "internet",
//           };
//           uploadIndex++;
//         }
//       }
//     }
//     let admin = await Admin.findOne({});
//     if (!admin) {
//       admin = new Admin();
//     }
//     admin.curation_picks = curations;
//     await admin.save();
//     return res.json({
//       success: true,
//       message: "Curation picks updated successfully.",
//       curations: admin.curation_picks,
//     });
//   } catch (error) {
//     console.error("Failed to update curation picks:", error);
//     return res
//       .status(500)
//       .json({ success: false, message: "Failed to update curation picks" });
//   }
// };

// exports.get_curation_picks = async function (req, res) {
//   try {
//     const admin = await Admin.findOne({}).populate({
//       path: "curation_picks",
//       select: "name image user",
//       populate: {
//         path: "user",
//         select: "name _id",
//       },
//     });
//     if (!admin) {
//       return res.json({ success: false, message: "No curation picks found." });
//     }
//     return res.json({ success: true, curations: admin.curation_picks });
//   } catch (error) {
//     console.error("Failed to fetch curation picks:", error);
//     return res
//       .status(500)
//       .json({ success: false, message: "Failed to fetch curation picks" });
//   }
// };

exports.get_admin_emails = async function (req, res) {
  try {
    const admins = await Admin.find({}).select("email");

    if (!admins || admins.length === 0) {
      return res.json({ success: false, message: "No emails found." });
    }

    const emailList = admins.flatMap((admin) => admin.email).filter(Boolean);

    if (emailList.length === 0) {
      return res.json({ success: false, message: "No emails found." });
    }
    return res.json({ success: true, emails: emailList });
  } catch (error) {
    console.error("Failed to fetch admin emails:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch admin emails" });
  }
};

exports.get_admin_requests = async function (req, res) {
  const user_id = res.locals.verified_user_id;

  try {
    const user = await User.findById(user_id);
    const userEmail = user?.email;

    if (!userEmail) {
      return res.json({ success: false, message: "No user found." });
    }

    const admins = await Admin.find({}).select("email");
    const adminEmails = admins.flatMap((admin) => admin.email);

    if (!adminEmails.includes(userEmail)) {
      return res.json({ success: false, message: "Not authorized." });
    }

    const business = await Business.find({})
      .select(
        "_id domain user_id  autoLogin auto_login_request"
      )
      .populate("user_id", "_id name username");
    return res.json({ success: true, requests: business });
  } catch (error) {
    console.log("Failed to fetch admin requests:", error);
    return res.json({
      success: false,
      message: "Failed to fetch admin requests",
    });
  }
};

exports.change_email_access = async function (req, res) {
  const newEmail = req.body.email;
  const searchEmail = "reach@chips.social";

  try {
    const user = await User.findOne({ email: searchEmail });
    if (!user) {
      return res.json({
        success: false,
        message: "No user found with the provided email.",
      });
    }
    user.email = newEmail;
    await user.save();
    return res.json({ success: true, message: "Email updated successfully." });
  } catch (error) {
    console.error("Failed to update email:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update email." });
  }
};

exports.update_admin_requests = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  console.log("Received body:", req.body);
  const updates = req.body.requests;
  if (!Array.isArray(updates) || updates.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "No update data provided." });
  }

  try {
    const user = await User.findById(user_id);
    const userEmail = user?.email;

    if (!userEmail) {
      return res.json({ success: false, message: "No user found." });
    }
    const admins = await Admin.find({}).select("email");
    const adminEmails = admins.flatMap((admin) => admin.email);
    if (!adminEmails.includes(userEmail)) {
      return res.json({ success: false, message: "Not authorized." });
    }

    const updatePromises = updates.map((req) =>
      Business.findByIdAndUpdate(
        req.id,
        {
          autoLogin: req.autoLogin,
          auto_login_request: false,
        },
        { new: true }
      )
    );
  

    const updatedBusinesses = await Promise.all(updatePromises);

    return res.json({ success: true, updated: updatedBusinesses });
  } catch (error) {
    console.error("Failed to update admin requests:", error);
    return res.json({
      success: false,
      message: "Failed to update admin requests",
    });
  }
};


async function syncBusinessUserAccess(data, businessId) {
  const channelMap = new Map();
  const topicMap = new Map();

  for (const row of data) {
    const { email, channelName, channelRole = 'member', topicName, topicRole = 'member' } = row;

    if (!email || !channelName) continue; // skip invalid
    const channelKey = `${businessId}_${channelName}`;
    let channelId = channelMap.get(channelKey);

    if (!channelId) {
      const channel = await Channel.findOne({ business: businessId, name: channelName }).select('_id').lean();
      if (!channel) {
        console.warn(`[Sync] Channel not found: "${channelName}"`);
        continue;
      }
      channelId = channel._id.toString();
      channelMap.set(channelKey, channelId);
    }
    await ChannelMembership.updateOne(
      { email, channel: channelId },
      {
        $set: {
          business: businessId,
          role: channelRole,
          status: "processing",
        },
        $setOnInsert: {
          joinedAt: new Date(),
        },
      },
      { upsert: true }
    );
    if (topicName) {
      const topicKey = `${channelId}_${topicName}`;
      let topicId = topicMap.get(topicKey);

      if (!topicId) {
        const topic = await Topic.findOne({ channel: channelId, name: topicName }).select('_id').lean();
        if (!topic) {
          console.warn(`[Sync] Topic not found: "${topicName}" under channel "${channelName}"`);
          continue;
        }
        topicId = topic._id.toString();
        topicMap.set(topicKey, topicId);
      }

      await TopicMembership.updateOne(
        { email, topic: topicId },
        {
          $set: {
            business: businessId,
            channel: channelId,
            role: topicRole,
            status: "processing",
          },
          $setOnInsert: {
            joinedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
  }

  console.log(`[Sync] ✅ Finished syncing ${data.length} rows for business ${businessId}`);
}