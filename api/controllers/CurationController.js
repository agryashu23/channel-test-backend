require("dotenv").config();
var mongoose = require("mongoose");
var Curation = mongoose.model("Curation");
var User = mongoose.model("User");
var Chip = mongoose.model("Chip");
var SavedCuration = mongoose.model("SavedCuration");
var SavedChip = mongoose.model("SavedChip");
const ChipController = require("../controllers/ChipController");
const {
  uploadSingleImage,
  deleteImageFromS3,
  uploadMultipleImages,
} = require("../aws/uploads/Images");
const rabbitmqService = require('../services/rabbitmqService');
const redisService = require('../services/redisService');

const CURATION_PREFIX = 'curation:';
const CURATIONS_ALL_PREFIX = 'curations:all:';
const CURATIONS_MY_PREFIX = 'curations:my:';

const CHIP_PREFIX = 'chip:';
const CHIPS_CURATION_PREFIX = 'chips:curation:';

const SEGMENT_ALL_PREFIX = 'segments:all:';
// const CURATIONS_SAVED_PREFIX = 'curations:saved:';

// Helper function to handle Redis cache operations
const handleCache = async (key, data, ttl = 7200) => {
  try {
    await redisService.setCache(key, data, ttl);
    return true;
  } catch (error) {
    console.error('Redis cache error:', error);
    return false;
  }
};

const invalidateCache = async (keys, type = 'curation') => {
  try {
    await rabbitmqService.publishInvalidation(keys, type);
    return true;
  } catch (error) {
    console.error('RabbitMQ invalidation error:', error);
    return false;
  }
};

exports.create_curation = async function (req, res, next) {
  const {
    name,
    category,
    visibility,
    description,
    image,
    profile_category = "",
  } = req.body;
  const user_id = res.locals.verified_user_id;
  let imageUrl = null;

  try {
    // const existingCuration = await Curation.findOne({
    //     name: name
    // });

    // if (existingCuration) {
    //     console.log("Curation name already exists");
    //     return res.json({
    //         success: false,
    //         message: "Curation name already exists! Try a new one.",
    //         create: false
    //     });
    // }
    if (req.file) {
      imageUrl = await uploadSingleImage(req.file, "curation");
    } else if (image) {
      imageUrl = image;
    }

    const curation_data = {
      name: name,
      category: category,
      description: description,
      user: user_id,
      visibility: visibility,
      image: imageUrl,
      profile_category: profile_category,
    };

    let newCuration = await Curation.create(curation_data);
    if (!newCuration) {
      return res.json({
        success: false,
        message: "Error in creating curation",
      });
    }
    newCuration = await Curation.findById(newCuration._id)
      .populate("user", { username: 1, name: 1, email: 1, logo: 1, color_logo: 1 })
      .exec();

    const cacheKeys = [
      `${CURATIONS_MY_PREFIX}${user_id}`,
      `${CURATIONS_ALL_PREFIX}${category}`,
      `${SEGMENT_ALL_PREFIX}${user_id}`,
    ];
    await invalidateCache(cacheKeys);

    res.json({
      success: true,
      message: "Curation created successfully",
      curation: newCuration,
    });
  } catch (error) {
    console.error("Error creating curation:", error);
    res.json({ success: false, message: "Error creating curation" });
  }
};
exports.edit_curation = async function (req, res, next) {
  const { id, name, category, visibility, description, image } = req.body;
  const user_id = res.locals.verified_user_id;
  let imageUrl = null;
  try {
    const existingCuration = await Curation.findById(id);
    if (!existingCuration) {
      return res.status(404).json({
        success: false,
        message: "Curation not found!",
      });
    }

    if (existingCuration.user.toString() !== user_id) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to edit this curation.",
      });
    }
    const nameExists = await Curation.findOne({ name: name, _id: { $ne: id } });
    if (nameExists) {
      return res.json({
        success: false,
        message: "Curation name already exists! Try a new one.",
      });
    }
    if (req.file) {
      imageUrl = await uploadSingleImage(req.file, "curation");
    } else if (image) {
      imageUrl = image;
    } else {
      imageUrl = existingCuration.image;
    }
    existingCuration.name = name;
    existingCuration.category = category;
    existingCuration.description = description;
    existingCuration.visibility = visibility;
    existingCuration.image = imageUrl;
    let updatedCuration = await existingCuration.save();
    if (!updatedCuration) {
      return res.json({ success: false, message: "Error in editing curation" });
    }
    updatedCuration = await Curation.findById(updatedCuration._id)
      .populate("user", { username: 1, name: 1, email: 1, logo: 1, color_logo: 1 })
      .exec();
      
    const cacheKeys = [
      `${CURATIONS_MY_PREFIX}${user_id}`,
      `${CURATIONS_ALL_PREFIX}${category}`,
      `${CURATION_PREFIX}${updatedCuration._id}`,
      `${SEGMENT_ALL_PREFIX}${user_id}`
    ];
    await invalidateCache(cacheKeys);
    
    res.json({
      success: true,
      message: "Curation updated successfully",
      curation: updatedCuration,
    });
  } catch (error) {
    console.error("Error updating curation:", error);
    res.status(500).json({
      success: false,
      message: "Error updating curation",
    });
  }
};

exports.check_curation_name = async function (req, res) {
  const { name } = req.body;
  const user_id = res.locals.verified_user_id;
  if (!name) {
    return res
      .status(400)
      .json({ success: false, message: "Curation name is required." });
  }
  try {
    const curation = await Curation.findOne({ name: name, user: user_id });
    if (!curation) {
      return res.json({ success: true, message: "Curation name is unique." });
    }
    return res.json({
      success: false,
      message: "Curation name already exists",
    });
  } catch (error) {
    console.error("Failed to search for curation name:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error in fetching curation name." });
  }
};

exports.fetch_my_curations = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const cacheKey = `${CURATIONS_MY_PREFIX}${user_id}`;
  
  try {
    const cachedCurations = await redisService.getCache(cacheKey);
    if (cachedCurations) {
      return res.json({
        success: true,
        curations: cachedCurations,
        message: "Curation fetched successfully"
      });
    }

    const curations = await Curation.find({ user: user_id })
      .select("_id name image")
      .sort({ timeAdded: -1 });

    await handleCache(cacheKey, curations);

    res.json({ 
      success: true, 
      curations,
      message: "Curation fetched successfully"
    });
  } catch (error) {
    console.error("Error fetching curations:", error);
    res.status(500).json({ 
      success: false, 
      message: "Cannot find curations" 
    });
  }
};

// exports.fetch_all_curations = async function (req, res) {
//   const { category } = req.body;
//   const cacheKey = `${CURATIONS_ALL_PREFIX}${category}`;
  
//   try {
//     // Try cache first
//     const cachedCurations = await redisService.getCache(cacheKey);
//     if (cachedCurations) {
//       return res.json({
//         success: true,
//         curations: cachedCurations,
//         message: "Curation fetched successfully"
//       });
//     }

//     // Get from DB if not in cache
//     const curations = await Curation.find({ category })
//       .populate("user", { username: 1, name: 1, email: 1, logo: 1 })
//       .sort({ timeAdded: -1 });

//     // Cache the results
//     await handleCache(cacheKey, curations);

//     res.json({ 
//       success: true, 
//       curations,
//       message: "Curation fetched successfully"
//     });
//   } catch (error) {
//     console.error("Error fetching curations:", error);
//     res.status(500).json({ 
//       success: false, 
//       message: "Cannot find curations" 
//     });
//   }
// };

// exports.save_curation = function(req,res){
//     const user_id = res.locals.verified_user_id;
//     //const user_id = req.body.user_id;
//     const curations = req.body.curations;
//     const data = {
//         user_id:user_id,
//         curations:curations
//     };
//    //
//     Curation.findOne({_id:curations,user_id : {$eq : user_id}}).then(curation =>{
//         if(!curation){
//             console.log("user is not the creator", user_id);
//             SavedCuration.findOne({user_id:user_id}).then(savedCuration =>{
//                 if(savedCuration){
//                     const has_saved = savedCuration.curations.includes(curations);
//                         if(!has_saved){
//                             savedCuration.curations.push(curations);
//                             savedCuration.save();
//                             res.json({success:true, message:"successfully saved curation to your board"})
//                         }else{
//                             res.json({success:false, message:"the curation is already saved"})
//                         }
//                     }else{
//                         SavedCuration.create(data).then(addedCuration =>{
//                             res.json({success:true, message:"added your board and successfully saved curation to your board"})
//                         })
//                     }
//                 }).catch(err =>{
//                     res.json({success:false, message:"Error while saving the curation 1"})
//                 })
//            // }
//         }else{
//             res.json({success:false, message:"Creator can't save their own curation"});
//         }
//     });
// }

exports.save_curation = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const curation_id = req.body.curation_id;

  try {
    const curation = await Curation.findOne({ _id: curation_id, user: { $eq: user_id } });
    if (curation) {
      return res.json({
        success: false,
        message: "Creator can't save their own curation",
      });
    }

    // Get the curation for category info
    const targetCuration = await Curation.findById(curation_id);
    if (!targetCuration) {
      return res.status(404).json({
        success: false,
        message: "Curation not found",
      });
    }

    let savedCuration = await SavedCuration.findOne({ user_id });
    if (savedCuration && savedCuration.curations.includes(curation_id)) {
      return res.json({
        success: false,
        message: "The curation is already saved",
      });
    }

    if (savedCuration) {
      savedCuration.curations.push(curation_id);
      await savedCuration.save();
    } else {
      await SavedCuration.create({
        user_id,
        curations: [curation_id],
      });
    }

    await Curation.updateOne(
      { _id: curation_id },
      { $addToSet: { saved_by: user_id } }
    );

    const cacheKeys = [
      `${CURATION_PREFIX}${curation_id}`,
      `${CURATIONS_ALL_PREFIX}${targetCuration.category}`,
      `${CURATIONS_MY_PREFIX}${user_id}`,
      `${SEGMENT_ALL_PREFIX}${user_id}`
    ];
    
    await invalidateCache(cacheKeys, 'curation');

    return res.json({
      success: true,
      message: "Successfully saved curation to your board",
    });
  } catch (error) {
    console.error("Error saving curation:", error);
    return res.status(500).json({
      success: false,
      message: "Error while saving the curation",
    });
  }
};

// exports.fetch_all_my_curations = async function (req, res) {
//   const user_id = res.locals.verified_user_id;
//   const cacheKey = `${CURATIONS_MY_PREFIX}${user_id}`;
  
//   try {
//     const cachedCurations = await redisService.getCache(cacheKey);
//     if (cachedCurations) {
//       return res.json({
//         success: true,
//         curations: cachedCurations,
//         message: "Curation fetched successfully"
//       });
//     }

//     const curations = await Curation.find({ user: user_id })
//       .populate("user", { username: 1, name: 1, email: 1, logo: 1 })
//       .sort({ timeAdded: -1 });

//     if (curations) {
//       await handleCache(cacheKey, curations);
//       return res.json({ 
//         success: true, 
//         curations,
//         message: "Curation fetched successfully"
//       });
//     }
//   } catch (error) {
//     console.error("Error fetching curations:", error);
//     return res.json({
//       success: false,
//       message: "Error while fetching your curation list",
//     });
//   }
// };

 exports.fetch_curation_from_curationId = async function (req, res) {
   const curation_id = req.body.curation_id;
   const cacheKey = `${CURATION_PREFIX}${curation_id}`;
  
   try {
     const cachedCuration = await redisService.getCache(cacheKey);
     if (cachedCuration) {
       return res.json({
         success: true,
         curation: cachedCuration,
         message: "Curation fetched successfully"
       });
     }

     const curation = await Curation.findById(curation_id)
       .populate("user", { username: 1, name: 1, email: 1, logo: 1, color_logo: 1 });

     if (curation) {
       await handleCache(cacheKey, curation);
       return res.json({ 
         success: true, 
         curation,
         message: "Curation fetched successfully"
       });
     }

     return res.json({
       success: false,
       message: "Curation not found"
     });
   } catch (error) {
     console.error("Error fetching curation:", error);
     return res.json({
       success: false,
       message: "Error while fetching curation"
     });
   }
 };

exports.fetch_category_curations = async function (req, res) {
  const { category } = req.body;
 
  
  try {
    const cacheKey = `${CURATIONS_ALL_PREFIX}${category}`;
    const cachedCurations = await redisService.getCache(cacheKey);
    if (cachedCurations) {
      return res.json({
        success: true,
        curations: cachedCurations,
        message: "Curation fetched successfully"
      });
    }

    const curations = await Curation.find({ category })
      .populate("user", { username: 1, name: 1, email: 1, logo: 1, color_logo: 1 });

    if (curations) {
      await handleCache(cacheKey, curations);
      return res.json({ 
        success: true, 
        curations,
        message: "Curation fetched successfully"
      });
    }

    return res.json({
      success: false,
      message: "No curations found for this category"
    });
  } catch (error) {
    console.error("Error fetching category curations:", error);
    return res.json({
      success: false,
      message: "Error while fetching curations"
    });
  }
};

exports.fetch_saved = async function (req, res) {
  const user_id = res.body.user_id;
  
  try {
    const [savedCurations, savedChipCurationIds] = await Promise.all([
      SavedCuration.find({ user_id }).select("curations"),
      SavedChip.find({ user_id })
        .select("curation_id")
        .distinct("curation_id")
    ]);

    const curationIds = [
      ...savedCurations.reduce((accum, doc) => [...accum, ...doc.curations], []),
      ...savedChipCurationIds,
    ];
    const uniqueCurationIds = [...new Set(curationIds)];

    const curations = await Curation.find({ _id: { $in: uniqueCurationIds } })
      .populate("user", { email: 1, name: 1, username: 1, logo: 1, color_logo: 1 });

    if (curations.length > 0) {
      return res.json({ success: true, curations });
    }

    return res.json({
      success: false,
      message: "No curations found for this user",
    });
  } catch (error) {
    console.error("Error fetching saved curations:", error);
    return res.json({ success: false, message: "Error fetching curations" });
  }
};

exports.fetch_saved_curations = async function (req, res) {
  const user_id = req.body.user_id;
  if (!user_id) {
    return res.status(400).json({ 
      success: false, 
      message: "User ID is required" 
    });
  }

  try {
    const savedCurations = await SavedCuration.find({ user_id }).select("curations");
    const curationIds = savedCurations.reduce(
      (acc, doc) => acc.concat(doc.curations),
      []
    );

    const curations = await Curation.find({ _id: { $in: curationIds } })
      .populate("user", { email: 1, name: 1, username: 1, logo: 1, color_logo: 1 });

    if (curations.length > 0) {
      return res.json({ success: true, curations });
    }

    return res.json({
      success: false,
      message: "No curations found for this user",
    });
  } catch (error) {
    console.error("Error fetching saved curations:", error);
    return res.json({ success: false, message: "Error fetching curations" });
  }
};

exports.toggle_save_curation = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { curation_id } = req.body;

  if (!curation_id) {
    return res.status(400).json({ 
      success: false, 
      message: "Curation ID is required" 
    });
  }

  try {
    let savedCuration = await SavedCuration.findOne({ user_id });
    let action;

    const cacheKeys = [
      `${CURATION_PREFIX}${curation_id}`,
      // `${CURATIONS_SAVED_PREFIX}${user_id}`
    ];

    if (savedCuration) {
      const curationIndex = savedCuration.curations.indexOf(curation_id);
      
      if (curationIndex !== -1) {
        // Unsave
        savedCuration.curations.splice(curationIndex, 1);
        action = "unsave";
        await Curation.updateOne(
          { _id: curation_id },
          { $pull: { saved_by: user_id } }
        );
      } else {
        // Save
        savedCuration.curations.push(curation_id);
        action = "save";
        await Curation.updateOne(
          { _id: curation_id },
          { $addToSet: { saved_by: user_id } }
        );
      }
      await savedCuration.save();
    } else {
      // Create new saved curation
      await SavedCuration.create({
        user_id,
        curations: [curation_id],
      });
      action = "save";
      await Curation.updateOne(
        { _id: curation_id },
        { $addToSet: { saved_by: user_id } }
      );
    }

    await invalidateCache(cacheKeys);

    const updatedCuration = await Curation.findById(curation_id);

    res.json({
      success: true,
      message: `Successfully ${action}d curation`,
      updatedCuration,
    });
  } catch (error) {
    console.error("Error while toggling save curation:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error while toggling save curation" 
    });
  }
};

exports.delete_curation = async function (req, res) {
  const userId = res.locals.verified_user_id;
  const { curation_id: curationId } = req.body;
  

  try {
    const curation = await Curation.findOne({ _id: curationId, user: userId });
    const cacheAllCurationKey = `${CURATIONS_ALL_PREFIX}${curation.profile_category}`;
    const cacheKey = `${CURATION_PREFIX}${curationId}`;
    const cacheMyCurationKey = `${CURATIONS_MY_PREFIX}${userId}`;
    const cacheChipKey = `${CHIP_PREFIX}${curationId}`;
    const cacheCurationChipKey = `${CHIPS_CURATION_PREFIX}${curationId}`;
    const cacheSegmentAllKey = `${SEGMENT_ALL_PREFIX}${userId}`;

    if (!curation) {
      return res.status(404).json({
        success: false,
        message: "Curation not found or does not belong to user",
      });
    }

    const curationImageUrl = curation.image;

    const deletionResult = await Curation.deleteOne({ _id: curationId });

    if (deletionResult.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Curation not found or could not be deleted",
      });
    }

    // Delete related documents
    await Promise.all([
      SavedCuration.deleteMany({ curation: curationId }),
      Chip.deleteMany({ curation: curationId }),
      SavedChip.deleteMany({ origin_id: curationId }),
    ]);

    // Delete the image from S3 if it exists
    if (curationImageUrl) {
      await deleteImageFromS3(curationImageUrl);
    }
    await invalidateCache([cacheAllCurationKey,cacheKey,cacheMyCurationKey,cacheChipKey,
      cacheCurationChipKey,cacheSegmentAllKey],'curation');
    return res.json({
      success: true,
      message: "Curation and related documents deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting curation:", err);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "An error occurred while deleting the curation",
      });
    }
  }
};





const updateCurationField = async (curation_id, fieldToUpdate) => {
  try {
    const currentCuration = await Curation.findById(curation_id);
    if (currentCuration) {
      currentCuration[fieldToUpdate] = currentCuration[fieldToUpdate] || 0;
      currentCuration[`total_${fieldToUpdate}`] =
        currentCuration[`total_${fieldToUpdate}`] || 0;

      currentCuration[fieldToUpdate] += 1;
      currentCuration[`total_${fieldToUpdate}`] += 1;

      await currentCuration.save();

      return { success: true };
    } else {
      return { success: false, message: "Curation not found" };
    }
  } catch (error) {
    console.error(`Error updating curation: ${error.message}`);
    return { success: false, message: "Server error" };
  }
};

exports.setCurationSearched = async function (req, res) {
  const { curation_id } = req.body;
  const result = await updateCurationField(curation_id, "searched");
  return res.json(result);
};

exports.setCurationEngagement = async function (req, res) {
  const { curation_id } = req.body;
  const result = await updateCurationField(curation_id, "engagement");
  return res.json(result);
};

exports.curation_shared_by = async function (req, res) {
  const { curation_id } = req.body;
  try {
    const currentCuration = await Curation.findById(curation_id);
    if (!currentCuration) {
      return res.status(404).json({ 
        success: false, 
        message: "Curation not found" 
      });
    }
    const cacheKeys = [
      `${CURATION_PREFIX}${currentCuration._id}`,
      `${CURATIONS_ALL_PREFIX}${currentCuration.category}`,
      `${CURATIONS_MY_PREFIX}${user_id}`,
      `${SEGMENT_ALL_PREFIX}${user_id}`
    ];

    // Use $inc for atomic increment
    const updatedCuration = await Curation.findByIdAndUpdate(
      curation_id,
      { $inc: { shared_by: 1 } },
      { new: true }
    );

    await invalidateCache(cacheKeys, 'curation');
    
    return res.json({ 
      success: true, 
      curation: updatedCuration 
    });
  } catch (error) {
    console.error(`Error updating curation: ${error.message}`);
    return res.json({ success: false, message: "Server error" });
  }
};


exports.curations_update_saved = async function (req, res) {
  try {
    const curations = await Curation.find({
      saved_by: { $exists: true, $ne: [] },
    });

    let modifiedCount = 0;
    for (let curation of curations) {
      if (curation.saved_by && Array.isArray(curation.saved_by)) {
        let needsUpdate = false;
        let fixedSavedBy = curation.saved_by.map((id) => {
          if (id && typeof id === "object" && id.$oid) {
            needsUpdate = true;
            return mongoose.Types.ObjectId(id.$oid); 
          }
          return id; 
        });

        if (needsUpdate) {
          curation.saved_by = fixedSavedBy;
          await curation.save();
          modifiedCount++;
        }
      }
    }

    res.send({ message: "Migration complete", modifiedCount });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Error during migration", error });
  }
};



//  const S3_URL = "https://chips-social.s3.ap-south-1.amazonaws.com";
//  const CLOUDFRONT_URL = "https://d3i6prk51rh5v9.cloudfront.net";
//  const UNSPLASH_URL = "https://images.unsplash.com/";

//  exports.update_images_title = async function(req, res) {
//     try {
//         const curationsToUpdate = await Curation.find({
//             image: { $regex: `^${S3_URL}` }
//         });

//         if (curationsToUpdate.length === 0) {
//             return res.status(200).json({
//                 success: true,
//                 message: "No curations found with S3 image URLs."
//             });
//         }
//         const updatePromises = curationsToUpdate.map(curation => {
//             if (!curation.image || curation.image.startsWith(UNSPLASH_URL)) {
//                 console.log(`Skipping curation ${curation._id} as it has no image or uses Unsplash image.`);
//                 return Promise.resolve();
//             }
//             const newImageUrl = curation.image.replace(S3_URL, CLOUDFRONT_URL);
//             return Curation.updateOne(
//                 { _id: curation._id },
//                 { $set: { image: newImageUrl } }
//             );
//         });
//         await Promise.all(updatePromises);

//         return res.status(200).json({
//             success: true,
//             message: `Updated ${curationsToUpdate.length} curation image URLs to CloudFront.`,
//         });
//     } catch (error) {
//         console.error('Error updating image URLs:', error);
//         return res.status(500).json({
//             success: false,
//             message: `Failed to update curation image URLs: ${error.message}`,
//         });
//     }
//  };
