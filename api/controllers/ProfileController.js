require("dotenv").config();
var mongoose = require("mongoose");
var Curation = mongoose.model("Curation");
var Chip = mongoose.model("Chip");
var User = mongoose.model("User");



exports.check_domain_name = function (req, res) {
  const domain = req.body.domain;
  User.findOne({ domain: domain }).then((domain) => {
    if (domain) {
      res.json({ success: false, message: " this domain name already exists" });
    } else {
      res.json({
        success: true,
        message: "You can create new domain with this domain name",
      });
    }
  });
};
exports.edit_profile = function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { name, username, link, description, logo } = req.body;
  User.findByIdAndUpdate(
    user_id,
    { name, username, link, description, logo },
    { new: true }
  )
    .then((updatedUser) => {
      console.log(updatedUser);
      if (!updatedUser) {
        return res
          .status(404)
          .json({ success: false, message: "User not found." });
      }
      res.json({
        success: true,
        message: "User profile updated successfully",
        user: updatedUser,
      });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({
        success: false,
        message: "Error while updating user profile.",
      });
    });
};





exports.get_curation_from_username = function (req, res) {
  const username = req.body.username;
  User.findOne({ username: username })
    .then((user) => {
      if (user) {
        //let user_id = user._id;
        Curation.find({ user: user._id })
          .then((curation) => {
            if (curation) {
              return res.json({ success: true, curation: curation });
            } else {
              return res.json({
                success: false,
                message: "this user has not created any curation",
              });
            }
          })
          .catch((err) => {
            return res.json({
              success: false,
              message: "Error while searching for curations",
            });
          });
      } else {
        return res.json({ success: false, message: "No such user exists" });
      }
    })
    .catch((err) => {
      return res.json({ success: true, message: "Error in searching user" });
    });
};



function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
exports.profile_chips_curations = async function (req, res) {
  const { userId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ success: false, message: "Invalid userId" });
  }

  const objectId = new mongoose.Types.ObjectId(userId);

  try {
    const [curations, chips] = await Promise.all([
      Curation.find({ user: objectId }).populate("user", {
        username: 1,
        name: 1,
        email: 1,
        logo: 1,
      }),
      Chip.find({
        user: objectId,
        $or: [{ curation: null }, { curation: { $exists: false } }],
      }).populate("user", { username: 1, name: 1, email: 1, logo: 1 }),
    ]);

    const items = [...curations, ...chips];
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    shuffleArray(items);
    return res.json({
      success: true,
      message: "Fetched curations and chips",
      items: items,
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
exports.limited_profile_chips_curations = async function (req, res) {
  const { userId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ success: false, message: "Invalid userId" });
  }

  const objectId = new mongoose.Types.ObjectId(userId);

  try {
    const [curations, chips] = await Promise.all([
      Curation.find({ user: objectId }).populate("user", {
        username: 1,
        name: 1,
        email: 1,
        logo: 1,
      }),
      Chip.find({
        user: objectId,
        $or: [{ curation: null }, { curation: { $exists: false } }],
      }).populate("user", { username: 1, name: 1, email: 1, logo: 1 }),
    ]);

    let items = [...curations, ...chips];
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    items = items.slice(0, 4);
    // shuffleArray(items);
    return res.json({
      success: true,
      message: "Fetched curations and chips",
      items: items,
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

exports.fetch_gallery_username = async function (req, res) {
  const username = req.body.username;
  if (!username) {
    return res.json({ success: false, message: "Username is required." });
  }
  try {
    const user = await User.findOne({ username: username });
    if (user) {
      res.json({ success: true, user: user });
    } else {
      res.json({ success: false, message: "User not found." });
    }
  } catch (error) {
    console.error("Failed to fetch profile:", error);
    res.json({ success: false, message: "Failed to fetch profile." });
  }
};



exports.gallery_chips_curations = async function (req, res) {
  const { username } = req.body;

  if (!username) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid usernmamw" });
  }
  try {
    const user = await User.findOne({ username: username });
    const objectId = user._id;
    const [curations, chips] = await Promise.all([
      Curation.find({ user: objectId }).populate("user", {
        username: 1,
        name: 1,
        email: 1,
        logo: 1,
      }),
      Chip.find({
        user: objectId,
        $or: [{ curation: null }, { curation: { $exists: false } }],
      }).populate("user", { username: 1, name: 1, email: 1, logo: 1 }),
    ]);

    const items = [...curations, ...chips];
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    shuffleArray(items);
    return res.json({
      success: true,
      message: "Fetched curations and chips",
      items: items,
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

const updateProfileFieldEngage = async (user_id, fieldToUpdate) => {
  try {
    const currentProfile = await User.findById(user_id);
    if (currentProfile) {
      currentProfile[fieldToUpdate] = currentProfile[fieldToUpdate] || 0;
      currentProfile[`total_${fieldToUpdate}`] =
        currentProfile[`total_${fieldToUpdate}`] || 0;

      currentProfile[fieldToUpdate] += 1;
      currentProfile[`total_${fieldToUpdate}`] += 1;

      await currentProfile.save();

      return { success: true };
    } else {
      return { success: false, message: "Profile not found" };
    }
  } catch (error) {
    console.error(`Error updating profile: ${error.message}`);
    return { success: false, message: "Server error" };
  }
};

exports.setProfileSearched = async function (req, res) {
  const { user_id } = req.body;
  const result = await updateProfileFieldEngage(user_id, "searched");
  return res.json(result);
};

exports.setProfileEngagement = async function (req, res) {
  const { user_id } = req.body;
  const result = await updateProfileFieldEngage(user_id, "engagement");
  return res.json(result);
};


