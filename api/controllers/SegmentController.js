require("dotenv").config();
var mongoose = require("mongoose");
var Curation = mongoose.model("Curation");
var Channel = mongoose.model("Channel");
var Chip = mongoose.model("Chip");
var User = mongoose.model("User");
var Segment = mongoose.model("Segment");
const rabbitmqService = require('../services/rabbitmqService');
const redisService = require('../services/redisService');

const SEGMENT_ALL_PREFIX = 'segments:all:';
const SEGMENT_CATEGORY_PREFIX = 'segments:category:';


const CHIP_PREFIX = 'chip:';
const CHIPS_CURATION_PREFIX = 'chips:curation:';

const CURATION_PREFIX = 'curation:';
const CURATIONS_ALL_PREFIX = 'curations:all:';
const CURATIONS_MY_PREFIX = 'curations:my:';


exports.profile_categories_chips_curations = async function (req, res) {
  const { user_id } = req.body;
  // const user_id = res.locals.verified_user_id;
  try {
    const cacheKey = `${SEGMENT_ALL_PREFIX}${user_id}`;
    const cachedSegment = await redisService.getCache(cacheKey);
    if (cachedSegment) {
      return res.json({
        success: true,
        message: "Fetched categorized curations and chips",
        categorizedItems: cachedSegment,
      });
    }
    const segment = await Segment.findOne({ user_id });
    const categories = segment ? segment.categories : [];
    const categoriesMap = categories.reduce((map, category) => {
      map[category._id.toString()] = {
        ...category.toObject(),
        items: [],
      };
      return map;
    }, {});
    categoriesMap[""] = {
      _id: "",
      name: "",
      expanded: true,
      items: [],
    };

    const curations = await Curation.find({ user: user_id }).populate(
      "user",
      "username name email logo"
    );
    const chips = await Chip.find({
      user: user_id,
      $or: [{ curation: null }, { curation: { $exists: false } }],
    }).populate("user", "username name email logo");

    const combinedItems = [...curations, ...chips];
    const shuffledItems = combinedItems.sort(() => Math.random() - 0.5);

    shuffledItems.forEach((item) => {
      const categoryId = item.profile_category || "";
      if (!categoriesMap[categoryId]) {
        categoriesMap[""].items.push(item);
      } else {
        categoriesMap[categoryId].items.push(item);
      }
    });

    const categorizedItems = Object.values(categoriesMap);
    await redisService.setCache(cacheKey, categorizedItems,7200);

    return res.json({
      success: true,
      message: "Fetched categorized curations and chips",
      categorizedItems,
    });
  } catch (err) {
    console.error("Error fetching curations and chips:", err);
    return res.status(500).json({
      success: false,
      message: "Error fetching curations and chips",
      error: err.message,
    });
  }
};

exports.gallery_categories_chips_curations = async function (req, res) {
  const { username } = req.body;
  if (!username) {
    return res.json({ sucess: false, message: "Username can't be empty" });
  }
  try {
    const user = await User.findOne({ username: username });
    const user_id = user._id;
    const cacheKey = `${SEGMENT_ALL_PREFIX}${user_id}`;
    const cachedSegment = await redisService.getCache(cacheKey);
    if (cachedSegment) {
      return res.json({
        success: true,
        message: "Fetched categorized curations and chips",
        categorizedItems: cachedSegment,
      });
    }
    const segment = await Segment.findOne({ user_id });
    const categories = segment ? segment.categories : [];
    const categoriesMap = categories.reduce((map, category) => {
      map[category._id.toString()] = {
        ...category.toObject(),
        items: [],
      };
      return map;
    }, {});

    categoriesMap[""] = {
      _id: "",
      name: "",
      expanded: true,
      items: [],
    };

    const curations = await Curation.find({ user: user_id }).populate(
      "user",
      "username name email logo"
    );
    const chips = await Chip.find({
      user: user_id,
      $or: [{ curation: null }, { curation: { $exists: false } }],
    }).populate("user", "username name email logo");

    const combinedItems = [...curations, ...chips];
    const shuffledItems = combinedItems.sort(() => Math.random() - 0.5);

    shuffledItems.forEach((item) => {
      const categoryId = item.profile_category || "";
      categoriesMap[categoryId].items.push(item);
    });
    const categorizedItems = Object.values(categoriesMap);
    await redisService.setCache(cacheKey, categorizedItems,7200);
    return res.json({
      success: true,
      message: "Fetched categorized curations and chips",
      categorizedItems,
    });
  } catch (err) {
    console.error("Error fetching curations and chips:", err);
    return res.status(500).json({
      success: false,
      message: "Error fetching curations and chips",
      error: err.message,
    });
  }
};

exports.create_profile_category = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { name, expanded, featured } = req.body;
  if (!name) {
    return res.status(400).json({
      success: false,
      message: "Category name is required",
    });
  }

  try {
    const cacheKey = `${SEGMENT_ALL_PREFIX}${user_id}`;
    let segment = await Segment.findOne({ user_id: user_id });
    if (segment) {
      const existingCategory = segment.categories.find(
        (category) => category.name === name
      );
      if (existingCategory) {
        return res.json({
          success: false,
          message: "Category name already exists",
        });
      } else {
        segment.categories.unshift({ name, expanded, featured });
        await segment.save();
        const savedCategory = segment.categories.find(
          (cat) => cat.name === name
        );
        await rabbitmqService.publishInvalidation([cacheKey],'segment');
        return res.json({
          success: true,
          category: savedCategory,
          message: "Category created",
        });

      }
    } else {
      const newSegment = new Segment({
        user_id: user_id,
        categories: [{ name, expanded, featured }],
      });
      await newSegment.save();
      await rabbitmqService.publishInvalidation([cacheKey],'segment');
      res.json({
        success: true,
        category: newSegment.categories[0],
        message: "Category created",
      });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Error creating categories",
      error: err.message,
    });
  }
};

exports.update_profile_category = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { _id, name, expanded, featured } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: "Category name is required",
    });
  }
  try {
    const cacheKey = `${SEGMENT_ALL_PREFIX}${user_id}`;
    const result = await Segment.findOneAndUpdate(
      { user_id: user_id, "categories._id": _id },
      { $set: { "categories.$.name": name } },
      { new: true }
    );

    if (result) {
      const updatedCategory = result.categories.find(
        (c) => c._id.toString() === _id
      );
      await rabbitmqService.publishInvalidation([cacheKey],'segment');
      return res.status(200).json({
        success: true,
        category: updatedCategory,
        message: "Category updated",
      });
    } else {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }
  } catch (err) {
    console.error("Error updating categories:", err);
    return res.status(500).json({
      success: false,
      message: "Error updating category",
      error: err.message,
    });
  }
};
exports.delete_profile_category = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Category not found",
    });
  }
  try {
    const segmentCacheKey = `${SEGMENT_ALL_PREFIX}${user_id}`;
    const categoryCacheKey = `${SEGMENT_CATEGORY_PREFIX}${user_id}`;
    const curationALLCacheKey = `${CURATIONS_ALL_PREFIX}${id}`;
    
    const segment = await Segment.findOne({ user_id: user_id });
    if (!segment) {
      return res.status(404).json({
        success: false,
        message: "Segment not found",
      });
    }
    const updatedCategories = segment.categories.filter(
      (cat) => cat._id.toString() !== id.toString()
    );
    segment.categories = updatedCategories;
    await segment.save();

    // Find affected curations and chips first
    const [affectedCurations, affectedChips] = await Promise.all([
      Curation.find({ user: user_id, profile_category: id }),
      Chip.find({ user: user_id, profile_category: id })
    ]);

    await Promise.all([
      Curation.updateMany(
        { user: user_id, profile_category: id },
        { $set: { profile_category: "" } }
      ),
      Chip.updateMany(
        { user: user_id, profile_category: id },
        { $set: { profile_category: "" } }
      ),
    ]);

    
    const cacheKeys = [segmentCacheKey,curationALLCacheKey,categoryCacheKey];
    affectedCurations.forEach(curation => {
      cacheKeys.push(`${CURATION_PREFIX}${curation._id}`);
      cacheKeys.push(`${CURATIONS_MY_PREFIX}${user_id}`);
      // if (curation.saved) {
      //   cacheKeys.push(`${CURATIONS_SAVED_PREFIX}${user_id}`);
      // }
    });
    affectedChips.forEach(chip => {
      cacheKeys.push(`${CHIP_PREFIX}${chip._id}`);
      if (chip.curation) {
        cacheKeys.push(`${CHIPS_CURATION_PREFIX}${chip.curation}`);
      }
    });

    const uniqueCacheKeys = [...new Set(cacheKeys)];
    await rabbitmqService.publishInvalidation(uniqueCacheKeys, 'segment');

    return res.status(200).json({
      success: true,
      id: id,
      message: "Category deleted",
    });
  } catch (err) {
    console.error("Error deleting category:", err);
    return res.status(500).json({
      success: false,
      message: "Error deleting category",
      error: err.message,
    });
  }
};

exports.update_item_category = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { id, type, categoryId } = req.body;
  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Item can't be null!",
    });
  }
  try {
    let item = null;
    if (type === "chip") {
      item = await Chip.findById(id);
    } else {
      item = await Curation.findById(id);
    }
    if (!item) {
      return res.status(400).json({
        success: false,
        message: `${type} not found!`,
      });
    }
    const initialCategory = item.profile_category;
    item.profile_category = categoryId;
    await item.save();
    if(type === "chip"){
      const cacheKey = `${CHIP_PREFIX}${item._id}`;
      const cacheCurationChipKey = `${CHIPS_CURATION_PREFIX}${item.curation}`;
      const cacheSegmentAllKey = `${SEGMENT_ALL_PREFIX}${user_id}`;
      await rabbitmqService.publishInvalidation([cacheKey,cacheCurationChipKey,cacheSegmentAllKey],'chip');
    }
    else {
      const cacheKey = `${CURATION_PREFIX}${item._id}`;
      const cacheAllCurationKey = `${CURATIONS_ALL_PREFIX}${item.profile_category}`;
      const cacheMyCurationKey = `${CURATIONS_MY_PREFIX}${user_id}`;
      const cacheSegmentAllKey = `${SEGMENT_ALL_PREFIX}${user_id}`;
      await rabbitmqService.publishInvalidation([cacheKey,cacheAllCurationKey,cacheMyCurationKey,cacheSegmentAllKey],'curation');
    }
    return res.status(200).json({
      success: true,
      message: `${type} category updated successfully!`,
      item: {
        ...item.toObject(),
        initialCategory: initialCategory,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Error updating category of item",
      error: err.message,
    });
  }
};

exports.fetch_profile_categories = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  if (!user_id) {
    return res.status(400).json({
      success: false,
      message: "User not found!",
    });
  }
  try {
    const cacheKey = `${SEGMENT_CATEGORY_PREFIX}${user_id}`;
    const cachedSegment = await redisService.getCache(cacheKey);
    if (cachedSegment) {
      return res.json({
        success: true,
        message: "Fetched categories successfully",
        categories: cachedSegment,
      });
    };
    
    const segment = await Segment.findOne({ user_id: user_id });
    if (!segment) {
      return res.json({
        success: false,
        message: "Profile segment not found!",
      });
    }
    let categories = [
      ...segment.categories.toObject(),
      {
        _id: "",
        name: "",
        expanded: true,
        featured: false,
      },
    ];
    await redisService.setCache(cacheKey,categories,7200);
    return res.status(200).json({
      success: true,
      message: "Fetched categories successfully",
      categories: categories,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Error fetching categories",
      error: err.message,
    });
  }
};

exports.update_profile_categories_order = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { categories } = req.body;

  if (!user_id) {
    return res.status(400).json({
      success: false,
      message: "User not found!",
    });
  }
  try {
    const cacheCategoryKey = `${SEGMENT_CATEGORY_PREFIX}${user_id}`;
    const cacheAllKey = `${SEGMENT_ALL_PREFIX}${user_id}`;
    let segment = await Segment.findOne({ user_id: user_id });
    if (!segment) {
      return res.status(404).json({
        success: false,
        message: "Profile segment not found!",
      });
    }
    segment.categories = categories;
    await segment.save();
    await rabbitmqService.publishInvalidation([cacheCategoryKey,cacheAllKey],'segment');
    return res.status(200).json({
      success: true,
      message: "Updated categories successfully",
      categories: categories,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Error updating categories",
      error: err.message,
    });
  }
};

exports.update_items_order_category = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { items } = req.body;

  if (!user_id) {
    return res.status(400).json({
      success: false,
      message: "User not found!",
    });
  }
  const cacheKeys = [];
  try {
    cacheKeys.push(`${SEGMENT_CATEGORY_PREFIX}${user_id}`);
    cacheKeys.push(`${SEGMENT_ALL_PREFIX}${user_id}`);
    for (const item of items) {
      if (item.type === "chip") {
        const chip = await Chip.findById(item.itemId);
        if (chip) {
          chip.profile_category = item.newCategoryId;
          cacheKeys.push(`${CHIP_PREFIX}${chip._id}`);
          cacheKeys.push(`${CHIPS_CURATION_PREFIX}${chip.curation}`);
          await chip.save();
        } else {
          return res.status(404).json({
            success: false,
            message: `Chip with ID ${item.itemId} not found!`,
          });
        }
      } else if (item.type === "curation") {
        const curation = await Curation.findById(item.itemId);
        if (curation) {
          curation.profile_category = item.newCategoryId;
          cacheKeys.push(`${CURATION_PREFIX}${curation._id}`);
          cacheKeys.push(`${CURATIONS_ALL_PREFIX}${curation.profile_category}`);
          cacheKeys.push(`${CURATIONS_MY_PREFIX}${user_id}`);
          await curation.save();
        } else {
          return res.status(404).json({
            success: false,
            message: `Curation with ID ${item.itemId} not found!`,
          });
        }
      }
    }
    await rabbitmqService.publishInvalidation(cacheKeys,'segment');
    return res.status(200).json({
      success: true,
      message: "Updated items successfully",
      categories: items,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Error updating items",
      error: err.message,
    });
  }
};

// exports.update_channel_members = async function (req, res) {
//   const { channelId } = req.body;
//   try {
//     const users = await User.find({});
//     const channel = await Channel.findById(channelId);

//     if (!channel) {
//       return res.status(404).json({
//         success: false,
//         message: "Channel not found",
//       });
//     }
//     users.forEach((user) => {
//       if (!channel.members.includes(user._id)) {
//         channel.members.push(user._id);
//       }
//     });
//     await channel.save();

//     return res.status(200).json({
//       success: true,
//       message: "Updated items successfully",
//       channel: channel,
//     });
//   } catch (err) {
//     return res.status(500).json({
//       success: false,
//       message: "Error updating items",
//       error: err.message,
//     });
//   }
// };

