require("dotenv").config();
var mongoose = require("mongoose");
var Query = mongoose.model("Query");
const { uploadMultipleImages } = require("../aws/uploads/Images");

exports.fetch_query = function (req, res) {
  Query.find({})
    .then((query) => {
      if (query && query.length > 0) {
        res.json({ success: true, query: query });
      } else {
        res.json({ success: true, query: [], message: "No queries found" });
      }
    })
    .catch((err) => {
      res.json({
        success: false,
        message: "Error while fetching your query list",
        error: err.message,
      });
    });
};

exports.post_query = async function (req, res) {
  const { text, email = "" } = req.body;
  try {
    const files = req.files;
    const imageFiles = [];

    if (files && files["files"]) {
      files["files"].forEach((file, index) => {
        imageFiles.push(file);
      });
    }

    const imageUrls = await uploadMultipleImages(imageFiles, "queries");
    let data = {
      text: text,
      email: email,
      images: imageUrls,
    };

    let queryCurr = await Query.create(data);
    if (queryCurr) {
      res.json({ success: true, query: queryCurr });
    } else {
      res.json({ success: false, message: "Failed to create the query" });
    }
  } catch (err) {
    res.json({
      success: false,
      message: "Error while posting your query",
      error: err.message,
    });
  }
};
exports.delete_query = async function (req, res) {
  const { id } = req.body;
  try {
    await Query.findByIdAndDelete(id);
    const updatedQueries = await Query.find({});
    res.json({
      success: true,
      message: "Query deleted successfully",
      query: updatedQueries,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error deleting query",
      error: err.message,
    });
  }
};
