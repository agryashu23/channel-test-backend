require("dotenv").config();
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
var mongoose = require("mongoose");
var Curation = mongoose.model("Curation");
var Chip = mongoose.model("Chip");
var SavedChip = mongoose.model("SavedChip");
var User = mongoose.model("User");
const {
  uploadMultipleImages,
  uploadMultipleImagesChips,
  deleteImageFromS3,
  uploadFileToS3,
  uploadMultipleVideos,
  generateThumbnail,
  apiMetadata,
  apiMetadata2,
} = require("../aws/uploads/Images");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const rabbitmqService = require('../services/rabbitmqService');
const redisService = require('../services/redisService');


const SEGMENT_ALL_PREFIX = 'segments:all:';
const SEGMENT_CATEGORY_PREFIX = 'segments:category:';

const CHIP_PREFIX = 'chip:';
const CHIPS_CURATION_PREFIX = 'chips:curation:';

const CURATION_PREFIX = 'curation:';
const CURATIONS_ALL_PREFIX = 'curations:all:';
const CURATIONS_MY_PREFIX = 'curations:my:';


async function getLatLngFromPlaceId(placeId) {
  const apiKey = process.env.MAPS_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${apiKey}`;
  try {
    const response = await axios.get(url);
    if (response.data.status === "OK") {
      const location = response.data.result.geometry.location;
      return location;
    } else {
      throw new Error("Place details not found");
    }
  } catch (error) {
    console.error("Error fetching place details:", error);
    throw error;
  }
}

exports.create_chip = async function (req, res) {
  try {
    const user_id = res.locals.verified_user_id;
    const {
      text,
      curation,
      category,
      location,
      link,
      date,
      docFiles,
      link_exclusive,
      text_exclusive,
      profile_category = "",
    } = req.body;

    const parsedLocation = JSON.parse(location);
    const parsedDate = JSON.parse(date);
    const parsedDocument = JSON.parse(docFiles || "{}");
    const image_urls = JSON.parse(req.body.image_urls || "[]");

    const files = req.files;
    const docFile = files["document"] ? files["document"][0] : null;

    if (parsedLocation.url.includes("place_id=")) {
      const placeId = parsedLocation.url.split("place_id=")[1].split("&")[0];
      const latLng = await getLatLngFromPlaceId(placeId);

      if (latLng) {
        parsedLocation.url = `https://www.google.com/maps/search/?api=1&query=${latLng.lat},${latLng.lng}`;
      }
    }

    const imageFiles = [];
    const videoFiles = [];

    if (files["files"]) {
      files["files"].forEach((file, index) => {
        if (image_urls[index].type === "image") {
          imageFiles.push({
            ...file,
            exclusive: image_urls[index].exclusive === true,
          });
        } else if (image_urls[index].type === "video") {
          videoFiles.push({
            ...file,
            exclusive: image_urls[index].exclusive === true,
          });
        }
      });
    }

    if (docFile) {
      let docUrl = await uploadFileToS3(docFile);
      if (docUrl) {
        parsedDocument.url = docUrl;
      }
    }

    const imageUrls = await uploadMultipleImagesChips(imageFiles, "chips");
    const videoData = await uploadMultipleVideos(videoFiles, "videos");
    
    const metaData = await apiMetadata(link);
    let ogImage = metaData?.ogImage;
    if (Array.isArray(ogImage)) {
      ogImage = ogImage[0]?.url || null;
    }

    if (curation) {
      const currentCuration = await Curation.findById(curation);
      if (currentCuration) {
        if (isNaN(currentCuration.chips_count)) {
          currentCuration.chips_count = 0;
        }
        currentCuration.chips_count += 1;
        await currentCuration.save();
      }
    }

    const new_chip = {
      user: user_id,
      curation: curation || null,
      category: category,
      text: text,
      location: parsedLocation,
      link: link,
      date: parsedDate,
      document: parsedDocument,
      profile_category: profile_category,
      link_exclusive: link_exclusive,
      text_exclusive: text_exclusive,
      metaLink:
        metaData && metaData.ogTitle && ogImage && metaData.ogDescription
          ? {
              ogTitle: metaData.ogTitle,
              ogImage: ogImage,
              ogDescription: metaData.ogDescription,
              ogSiteName: metaData.ogSiteName,
              ogUrl: metaData.ogUrl,
            }
          : null,
      image_urls: [
        ...imageUrls.map((url, index) => ({
          id: uuidv4(),
          url,
          type: "image",
          exclusive: imageFiles[index].exclusive,
          source: "internet",
        })),
        ...videoData.urls.map((url, index) => ({
          id: uuidv4(),
          url,
          thumbnail: videoData.thumbnails[index],
          type: "video",
          exclusive: videoFiles[index].exclusive,
          source: "internet",
        })),
      ],
    };

    let chip = await Chip.create(new_chip);
    if (!chip) {
      return res.json({ success: false, message: "Error in creating chip" });
    }
    chip = await Chip.findById(chip._id)
      .populate("user", { username: 1, name: 1, email: 1, logo: 1, color_logo: 1 })
      .exec();
    const cacheKeys = [
      `${CHIPS_CURATION_PREFIX}${curation}`,
      `${SEGMENT_ALL_PREFIX}${user_id}`,

    ];
    if(category){
      cacheKeys.push(`${SEGMENT_ALL_PREFIX}${user_id}`);
    }
    await rabbitmqService.publishInvalidation(cacheKeys, 'chip');
    res.json({ success: true, message: "Chip created successfully", chip });
  } catch (err) {
    console.log(err);
    res.json({
      success: false,
      message: "Error while creating chip",
      error: err.message,
    });
  }
};

exports.edit_chip = async function (req, res) {
  try {
    const user_id = res.locals.verified_user_id;
    const {
      id,
      text,
      curation,
      category,
      location,
      link,
      date,
      docFiles,
      link_exclusive,
      text_exclusive,
    } = req.body;
    const parsedLocation = JSON.parse(location);
    const parsedDate = JSON.parse(date);
    const image_urls = JSON.parse(req.body.image_urls);
    const parsedDocument = JSON.parse(docFiles || "{}");

    const files = req.files;
    const imageFiles = [];
    const videoFiles = [];
    const docFile = files["document"] ? files["document"][0] : null;

    if (parsedLocation.url.includes("place_id=")) {
      const placeId = parsedLocation.url.split("place_id=")[1].split("&")[0];
      const latLng = await getLatLngFromPlaceId(placeId);

      if (latLng) {
        parsedLocation.url = `https://www.google.com/maps/search/?api=1&query=${latLng.lat},${latLng.lng}`;
      }
    }

    if (!id) {
      return res.json({ success: false, message: "Id is null" });
    }

    let ind = 0;
    image_urls.forEach((image, index) => {
      if (image.source === "upload") {
        const file = files["files"][ind];
        ind++;
        if (file) {
          if (image.type == "video") {
            videoFiles.push({ ...file, exclusive: image.exclusive });
          } else {
            imageFiles.push({ ...file, exclusive: image.exclusive });
          }
        }
      }
    });
    if (docFile) {
      let docUrl = await uploadFileToS3(docFile);
      if (docUrl) {
        parsedDocument.url = docUrl;
      }
    }
    const imageUrls = await uploadMultipleImages(imageFiles, "chips");
    const videoData = await uploadMultipleVideos(videoFiles, "videos");
    const mediaFiles = [];
    let j = 0;
    let k = 0;
    for (let i = 0; i < image_urls.length; i++) {
      if (image_urls[i].source === "upload") {
        if (image_urls[i].type === "image") {
          mediaFiles.push({
            id: image_urls[i].id,
            url: imageUrls[j],
            exclusive: image_urls[i].exclusive,
            source: "internet",
            type: image_urls[i].type,
          });
          j++;
        } else {
          mediaFiles.push({
            id: image_urls[i].id,
            url: videoData.urls[k],
            thumbnail: videoData.thumbnails[k],
            exclusive: image_urls[i].exclusive,
            source: "internet",
            type: image_urls[i].type,
          });
          k++;
        }
      } else {
        mediaFiles.push(image_urls[i]);
      }
    }

    const metaData = await apiMetadata(link);

    let ogImage = metaData?.ogImage;
    if (Array.isArray(ogImage)) {
      ogImage = ogImage[0]?.url || null;
    }
    const updated_chip = {
      user: user_id,
      category: category,
      text: text,
      location: parsedLocation,
      link: link,
      document: parsedDocument,
      link_exclusive: link_exclusive,
      text_exclusive: text_exclusive,
      date: parsedDate,
      metaLink:
        metaData && metaData.ogTitle && ogImage && metaData.ogDescription
          ? {
              ogTitle: metaData.ogTitle,
              ogImage: ogImage,
              ogDescription: metaData.ogDescription,
              ogSiteName: metaData.ogSiteName,
              ogUrl: metaData.ogUrl,
            }
          : null,
      image_urls: mediaFiles,
    };
    if (curation && curation !== "null") {
      updated_chip.curation = curation;
    }

    const chip = await Chip.findByIdAndUpdate(id, updated_chip, { new: true })
      .populate("user", { username: 1, name: 1, email: 1, logo: 1, color_logo: 1 })
      .exec();
    if (!chip) {
      return res.json({ success: false, message: "Error in updating chip" });
    }
    const cacheKeys = [
      `${CHIP_PREFIX}${id}`,
      `${CHIPS_CURATION_PREFIX}${chip.curation}`,
      `${SEGMENT_ALL_PREFIX}${user_id}`,
    ];
    
    await rabbitmqService.publishInvalidation(cacheKeys, 'chip');
    res.json({
      success: true,
      message: "Chip updated successfully",
      chip: chip,
    });
  } catch (err) {
    console.log(err);
    res.json({
      success: false,
      message: "Error while creating chip",
      error: err.message,
    });
  }
};

exports.add_curation_to_chip = async function (req, res) {
  try {
    const { chip_id, curation_id } = req.body;
    const user_id = res.locals.verified_user_id;

    const chip = await Chip.findOne({ _id: chip_id });
    if (!chip) {
      return res.json({ success: false, message: "Chip not found" });
    }

    const oldCuration = chip.curation; 
    chip.curation = curation_id;
    await chip.save();

    const cacheKeys = [
      `${CHIP_PREFIX}${chip_id}`,
      `${CHIPS_CURATION_PREFIX}${curation_id}`,
      `${SEGMENT_ALL_PREFIX}${user_id}`,
    ];
    if (oldCuration) {
      cacheKeys.push(
        `${CHIPS_CURATION_PREFIX}${oldCuration}`,
      );
    }

    await rabbitmqService.publishInvalidation(cacheKeys, 'chip');
    
    return res.json({
      success: true,
      message: "Curation added to chip successfully",
    });
  } catch (err) {
    console.error("Error adding curation to chip:", err);
    return res.json({ 
      success: false, 
      message: "Couldn't add curation to chip",
      error: err.message 
    });
  }
};

// exports.fetch_all_chips_of_curation = async function (req, res) {
//   try {
//     const { curation_id } = req.body;
//     const cacheKey = `${CHIPS_ALL_CURATION_PREFIX}${curation_id}`;
    
//     const cachedChips = await redisService.getCache(cacheKey);
//     if (cachedChips) {
//       return res.json({ success: true, chips: cachedChips });
//     }

//     const chips = await Chip.find({ curation: curation_id })
//       .sort({ timeAdded: -1 })
//       .populate("user", { email: 1, username: 1, name: 1, logo: 1 });

//     const savedChipIds = await SavedChip.find({ curation_id: curation_id })
//       .select("chip_id")
//       .distinct("chip_id");

//     const savedChips = await Chip.find({ _id: { $in: savedChipIds } })
//       .populate("user", { email: 1, username: 1, name: 1, logo: 1 });

//     const allChips = [...chips, ...savedChips].sort(
//       (chip1, chip2) => chip2.timestamp - chip1.timeAdded
//     );

//     if (allChips.length > 0) {
//       // Cache the results
//       await redisService.setCache(cacheKey, allChips, 7200);
//       return res.json({ success: true, chips: allChips });
//     } else {
//       return res.json({
//         success: false,
//         message: "No chips found for this curation",
//       });
//     }
//   } catch (err) {
//     console.error(err);
//     return res.json({ success: false, message: "Error fetching chips" });
//   }
// };

// exports.fetch_my_chips_of_curation = async function (req, res) {
//   try {
//     const user_id = res.locals.verified_user_id;
//     const { curation_id } = req.body;
//     const cacheKey = `${CHIPS_MY_CURATION_PREFIX}${curation_id}`;

//     // Try to get from cache first
//     const cachedChips = await redisService.getCache(cacheKey);
//     if (cachedChips) {
//       return res.json({ success: true, chips: cachedChips });
//     }

//     const chips = await Chip.find({ curation: curation_id, user: user_id })
//       .sort({ timeAdded: -1 })
//       .populate("user", { username: 1, name: 1, email: 1, logo: 1 });

//     const savedChipIds = await SavedChip.find({ 
//       curation_id: curation_id, 
//       user_id: user_id 
//     })
//       .select("chip_id")
//       .distinct("chip_id");

//     const savedChips = await Chip.find({ _id: { $in: savedChipIds } })
//       .populate("user", { username: 1, name: 1, email: 1, logo: 1 });

//     const allChips = [...chips, ...savedChips].sort(
//       (chip1, chip2) => chip2.timestamp - chip1.timeAdded
//     );

//     if (allChips.length > 0) {
//       await redisService.setCache(cacheKey, allChips, 7200);
//       return res.json({ success: true, chips: allChips });
//     } else {
//       return res.json({
//         success: false,
//         message: "No chips added/created by you in this curation",
//       });
//     }
//   } catch (err) {
//     console.error(err);
//     return res.json({ success: false, message: "Error fetching chips" });
//   }
// };

// exports.fetch_all_chips = async function (req, res) {
//   try {
//     const { user_id } = req.body;
//     const cacheKey = `${CHIPS_ALL_PREFIX}${user_id}`;

//     const cachedChips = await redisService.getCache(cacheKey);
//     if (cachedChips) {
//       return res.json({ success: true, chips: cachedChips });
//     }

//     const chips = await Chip.find({ user: user_id })
//       .sort({ timeAdded: -1 })
//       .populate("user", { username: 1, name: 1, email: 1, logo: 1 });

//     await redisService.setCache(cacheKey, chips, 7200);
//     return res.json({ success: true, chips: chips });
//   } catch (err) {
//     console.log(err);
//     return res.json({ success: false, message: "Cannot find chips" });
//   }
// };

exports.fetch_chips_of_curation = async function (req, res) {
  try {
    const { curId } = req.body;
    const cacheKey = `${CHIPS_CURATION_PREFIX}${curId}`;

    const cachedChips = await redisService.getCache(cacheKey);
    if (cachedChips) {
      return res.json({ success: true, chips: cachedChips });
    }

    const chips = await Chip.find({ curation: curId })
      .sort({ timeAdded: -1 })
      .populate("user", { username: 1, name: 1, email: 1, logo: 1, color_logo: 1 });

    await redisService.setCache(cacheKey, chips, 7200);
    return res.json({ success: true, chips: chips });
  } catch (err) {
    console.log(err);
    return res.json({ success: false, message: "Cannot find chips" });
  }
};

exports.fetch_chip_from_chipId = async function (req, res) {
  try {
    const { chipId } = req.body;
    const cacheKey = `${CHIP_PREFIX}${chipId}`;

    const cachedChip = await redisService.getCache(cacheKey);
    if (cachedChip) {
      return res.json({ success: true, chip: cachedChip });
    }

    const chip = await Chip.findById(chipId)
      .populate("user", { username: 1, name: 1, email: 1, logo: 1, color_logo: 1 })
      .populate({
        path: "curation",
        select: "name image",
        options: { strictPopulate: false },
      });

    await redisService.setCache(cacheKey, chip, 7200);
    return res.json({ success: true, chip: chip });
  } catch (err) {
    console.log(err);
    return res.json({ success: false, message: "Cannot find chip" });
  }
};

exports.upvote_chip = async function (req, res) {
  try {
    const user_id = res.locals.verified_user_id;
    const chip_id = req.body.chip_id;

    if (!chip_id) {
      return res.status(400).json({ 
        success: false, 
        message: "Chip ID is required" 
      });
    }
    
    const chip = await Chip.findOne({ _id: chip_id });
    if (!chip) {
      return res.status(404).json({ 
        success: false, 
        message: "Chip not found" 
      });
    }

    const cacheKey = `${CHIP_PREFIX}${chip_id}`;
    const cacheCurationChipKey = `${CHIPS_CURATION_PREFIX}${chip.curation}`;
    const cacheSegmentAllKey = `${SEGMENT_ALL_PREFIX}${user_id}`;

    const chip_upvoted = chip.upvotes.indexOf(user_id);
    if (chip_upvoted !== -1) {
      chip.upvotes.splice(chip_upvoted, 1);
      await chip.save();
      await rabbitmqService.publishInvalidation(
        [cacheKey,  cacheCurationChipKey, cacheSegmentAllKey],
        'chip'
      );
      return res.status(200).json({
        success: true,
        message: "Chip downvoted successfully",
        updatedChip: chip,
      });
    } else {
      chip.upvotes.push(user_id);
      await chip.save();
      await rabbitmqService.publishInvalidation(
        [cacheKey,  cacheCurationChipKey, cacheSegmentAllKey],
        'chip'
      );
      return res.status(200).json({ 
        success: true, 
        message: "Chip upvoted successfully", 
        updatedChip: chip 
      });
    }
  } catch (err) {
    console.error("Error performing upvote operation:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Error while performing upvote operation",
      error: err.message
    });
  }
};

exports.delete_chip = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { chip_id } = req.body;

  try {
    const deletedChip = await Chip.findOneAndDelete({
      _id: chip_id,
      user: user_id,
    });

    if (!deletedChip) {
      return res.status(404).json({
        success: false,
        message: "Chip not found or user not authorized to delete this chip"
      });
    }

    const cacheKey = `${CHIP_PREFIX}${chip_id}`;
    const cacheCurationChipKey = `${CHIPS_CURATION_PREFIX}${deletedChip.curation}`;
    const cacheSegmentAllKey = `${SEGMENT_ALL_PREFIX}${user_id}`;

    if (Array.isArray(deletedChip.image_urls) && deletedChip.image_urls.length > 0) {
      try {
        await Promise.all(
          deletedChip.image_urls.map(async (image) => {
            if (image.url) {
              await deleteImageFromS3(image.url);
            }
          })
        );
      } catch (s3Error) {
        console.error("Error deleting images from S3:", s3Error);
      }
    }

    if (deletedChip.curation) {
      try {
        await Curation.findByIdAndUpdate(deletedChip.curation, {
          $inc: { chips_count: -1 },
        });
      } catch (curationError) {
        console.error("Error updating curation chips count:", curationError);
      }
    }

    try {
      await SavedChip.deleteMany({ chip_id: chip_id });
    } catch (savedChipError) {
      console.error("Error deleting saved chips:", savedChipError);
    }

    await rabbitmqService.publishInvalidation(
      [cacheKey, cacheCurationChipKey, cacheSegmentAllKey],
      'chip'
    );

    return res.status(200).json({
      success: true,
      message: "Chip and related data deleted successfully"
    });
  } catch (err) {
    console.error("Error deleting chip:", err);
    return res.status(500).json({
      success: false,
      message: "Error while deleting chip and related data",
      error: err.message
    });
  }
};

exports.save_exclusive_chip_data = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const chipId = req.body.chipId;

  try {
    const user = await User.findById(user_id);
    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }
    const user_data = {
      name: user.name,
      username: user.username,
      email: user.email,
      user: user._id,
    };
    const chip = await Chip.findById(chipId);
    if (!chip) {
      return res.json({ success: false, message: "Chip not found" });
    }
    const user_index = chip.exclusive_users.findIndex(
      (exclusive_user) => exclusive_user.email === user_data.email
    );
    if (user_index !== -1) {
      return res.json({
        success: true,
        message: "User details already saved.",
        updatedChip: chip,
      });
    } else {
      chip.exclusive_users.push(user_data);
      await chip.save();
      return res.json({
        success: true,
        message: "User details saved.",
        updatedChip: chip,
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error saving user details for exclusive chips.",
    });
  }
};

exports.update_chip_curation = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { id, curationId } = req.body;

  if (!id || !curationId) {
    return res.json({
      success: false,
      message: "Chip ID and curation ID are required!",
    });
  }

  try {
    const chip = await Chip.findOne({ _id: id, user: user_id });
    if (!chip) {
      return res.json({
        success: false,
        message: "Chip not found!",
      });
    }

    const oldCuration = chip.curation;
    if (oldCuration) {
      const oldCurationDoc = await Curation.findById(oldCuration);
      if (oldCurationDoc) {
        oldCurationDoc.chips_count = Math.max(0, (oldCurationDoc.chips_count || 0) - 1);
        await oldCurationDoc.save();
      }
    }
    const newCurationDoc = await Curation.findById(curationId);
    if (!newCurationDoc) {
      return res.json({
        success: false,
        message: "Target curation not found!",
      });
    }

    newCurationDoc.chips_count = (newCurationDoc.chips_count || 0) + 1;
    await newCurationDoc.save();

    
    chip.curation = curationId;
    const profileCategory = chip.profile_category;
    chip.profile_category = ""; 
    await chip.save();

    const cacheKeys = [
      `${CHIP_PREFIX}${chip._id}`,
      `${SEGMENT_ALL_PREFIX}${user_id}`,
    ];
    if(oldCuration && oldCuration !== curationId){
      cacheKeys.push(`${CHIPS_CURATION_PREFIX}${oldCuration}`);
    }
    cacheKeys.push(`${CHIPS_CURATION_PREFIX}${curationId}`);
    
    await rabbitmqService.publishInvalidation(cacheKeys, 'chip');

    return res.json({
      success: true,
      message: "Chip curation updated successfully!",
      chip: chip,
      oldCuration: oldCuration,
      newCuration: curationId,
      profileCategory: profileCategory,
    });

  } catch (err) {
    return res.json({
      success: false,
      message: "Error updating curation of chip",
      error: err.message,
    });
  }
};

exports.get_exclusive_chip_data = async function (req, res) {
  const { chipId } = req.body;

  try {
    const chip = await Chip.findById(chipId);
    const cacheKey = `${CHIP_PREFIX}${chipId}`;
    const cacheCurationChipKey = `${CHIPS_CURATION_PREFIX}${chip.curation}`;
    if (!chip) {
      return res
        .status(404)
        .json({ success: false, message: "Chip not found" });
    }
    const exclusiveUsers =
      chip.exclusive_users?.map((user) => ({
        name: user.name,
        username: user.username,
        email: user.email,
      })) || [];
      await rabbitmqService.publishInvalidation(
        [cacheKey,  cacheCurationChipKey],
        'chip'
      );
    return res.status(200).json({
      success: true,
      message: "User details found.",
      exclusive: exclusiveUsers,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Error retrieving user details for exclusive chips.",
    });
  }
};

exports.toggle_save_chip = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { chip_id, curation_id, origin_id } = req.body;

  try {
    let chip = await Chip.findById(chip_id);
    const cacheKey = `${CHIP_PREFIX}${chip_id}`;
    const cacheCurationChipKey = `${CHIPS_CURATION_PREFIX}${chip.curation}`;
    if (!chip) {
      return res
        .status(404)
        .json({ success: false, message: "Chip not found" });
    }
    const hasSaved = chip.saved_by.includes(user_id);

    if (hasSaved) {
      // If already saved, remove user_id from saved_by array
      chip.saved_by.pull(user_id);
      await chip.save();

      // Delete the SavedChip document if it exists
      await SavedChip.deleteOne({
        chip_id: chip_id,
        user_id: user_id,
        $or: [{ origin_id: origin_id }, { curation_id: curation_id }],
      });
      await rabbitmqService.publishInvalidation(
        [cacheKey,  cacheCurationChipKey],
        'chip'
      );

      return res.json({
        success: true,
        message: "Chip unsaved successfully",
        updatedChip: chip,
      });
    } else {
      // If not saved, add user_id to saved_by array
      chip.saved_by.push(user_id);
      await chip.save();

      // Create the SavedChip document if it doesn't exist
      const existingSavedChip = await SavedChip.findOne({
        chip_id: chip_id,
        user_id: user_id,
        $or: [{ origin_id: origin_id }, { curation_id: curation_id }],
      });

      if (!existingSavedChip) {
        await SavedChip.create({
          user_id: user_id,
          chip_id: chip_id,
          curation_id: curation_id,
          origin_id: origin_id,
        });
      }
      await rabbitmqService.publishInvalidation(
        [cacheKey,  cacheCurationChipKey],
        'chip'
      );

      return res.json({
        success: true,
        message: "Chip saved successfully",
        updatedChip: chip,
      });
    }
  } catch (err) {
    console.error("Error while toggling save chip:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error while toggling save chip" });
  }
};

exports.fetch_saved_chips = async function (req, res) {
  try {
    const { user_id } = req.body;
    if (!user_id) {
      return res.json({ success: false, message: "User ID is required" });
    }

    // const cacheKey = `${CHIPS_SAVED_PREFIX}${user_id}`;
    // const cachedChips = await redisService.getCache(cacheKey);
    // if (cachedChips) {
    //   return res.json({ success: true, chips: cachedChips });
    // }

    const savedChips = await SavedChip.find({ user_id: user_id })
      .select("chip_id curation_id");

    const chipsWithCuration = await Promise.all(
      savedChips.map(async (savedChip) => {
        try {
          const chip = await Chip.findById(savedChip.chip_id)
            .populate("user", { email: 1, name: 1, username: 1, logo: 1, color_logo: 1 });
          
          if (chip) {
            return {
              ...chip.toObject(),
              curation_id: savedChip.curation_id,
            };
          }
          return null;
        } catch (err) {
          console.error(`Error fetching chip for chip_id: ${savedChip.chip_id}`, err);
          return null;
        }
      })
    );

    const validChips = chipsWithCuration.filter((chip) => chip !== null);
    if (validChips.length > 0) {
      // await redisService.setCache(cacheKey, validChips, 7200);
      return res.json({ success: true, chips: validChips });
    } else {
      return res.json({
        success: false,
        message: "No chips found for this user",
      });
    }
  } catch (error) {
    console.error("Error fetching saved chips", error);
    return res.json({ success: false, message: "Error fetching chips" });
  }
};

async function getGeocode(latitude, longitude) {
  const apiKey = process.env.MAPS_API_KEY; // Replace with your Google Maps API key
  const url =
    "https//maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}";

  try {
    const response = await axios.get(url);
    if (response.data.status === "OK") {
      const address = response.data.results[0].formatted_address;
      return address;
    } else {
      return "Address not found";
    }
  } catch (error) {
    console.error("Error fetching geocoding data:", error);
    return "Error fetching address";
  }
}

exports.getAddress = async function (req, res) {
  const { latitude, longitude } = req.query;
  const address = await getGeocode(latitude, longitude);
  res.json({ address });
};

exports.metadata = async function (req, res) {
  const { url } = req.query;
  if (!url) {
    return res.status(400).send("URL parameter is required");
  }
  try {
    const options = { url: decodeURIComponent(url) };
    const results = await ogs(options);
    res.json(results.result);
  } catch (error) {
    console.error("Error fetching metadata:", error);
    res.status(500).json({ error: "Failed to fetch metadata" });
  }
};



exports.chip_shared_by = async function (req, res) {
  try {
    const { chip_id } = req.body;
    const chip = await Chip.findOne({ _id: chip_id });
    
    if (!chip) {
      return res.json({ success: false, message: "Chip not found" });
    }
    const cacheKeys=[
      `${CHIP_PREFIX}${chip_id}`,
      `${SEGMENT_ALL_PREFIX}${chip.user}`,
    ]
    if(chip.curation){
      cacheKeys.push(`${CHIPS_CURATION_PREFIX}${chip.curation}`);
    }
    if(!chip.shared_by){
      chip.shared_by=0;
    }
    chip.shared_by+=1;
    await chip.save();
    
    await rabbitmqService.publishInvalidation(
      cacheKeys,
      'chip'
    );
    
    return res.json({ success: true, message: "Chip shared successfully",chip:chip });
  } catch (err) {
    console.error("Error sharing chip:", err);
    return res.json({ success: false, message: "Error while sharing the Chip" });
  }
};

exports.places = async function (req, res) {
  const input = req.query.input;
  const apiKey = "AIzaSyA4giJjY94Cl2MJegYyp0NZYIUEOUTq9I0"; // Consider using environment variables for API keys
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
    input
  )}&key=${apiKey}`;

  try {
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateChipField = async (chip_id, fieldToUpdate) => {
  try {
    const currentChip = await Chip.findById(chip_id);
    if (currentChip) {
      currentChip[fieldToUpdate] = currentChip[fieldToUpdate] || 0;
      currentChip[`total_${fieldToUpdate}`] =
        currentChip[`total_${fieldToUpdate}`] || 0;

      currentChip[fieldToUpdate] += 1;
      currentChip[`total_${fieldToUpdate}`] += 1;

      await currentChip.save();

      return { success: true };
    } else {
      return { success: false, message: "Chip not found" };
    }
  } catch (error) {
    console.error(`Error updating chip: ${error.message}`);
    return { success: false, message: "Server error" };
  }
};

exports.setChipSearched = async function (req, res) {
  const { chip_id } = req.body;
  const result = await updateChipField(chip_id, "searched");
  return res.json(result);
};

exports.setChipEngagement = async function (req, res) {
  const { chip_id } = req.body;
  const result = await updateChipField(chip_id, "engagement");
  return res.json(result);
};

exports.deleteFieldFromChip = async function (req, res) {
  try {
    const result = await Chip.updateMany({}, { $unset: { shared_by: "" } });
    return res.json({
      success: true,
      message: `'shared_by' field removed from ${result.nModified} chips.`,
    });
  } catch (error) {
    console.error(
      `Error removing 'shared_by' field from chips: ${error.message}`
    );
    return res.status(500).json({ success: false, message: "Server error" });
  }
};





  