require("dotenv").config();
var mongoose = require("mongoose");
var Faqs = mongoose.model("Faqs");
var User = mongoose.model("User");
const rabbitmqService = require('../services/rabbitmqService');
const redisService = require('../services/redisService');


const FAQS_ALL_PREFIX = 'faqs:all:';


exports.create_faq = async function (req, res) {
  const { question, answer } = req.body;
  const user_id = res.locals.verified_user_id;

  if (!user_id) {
    return res.json({ success: false, message: "User Id is required." });
  }

  if (!question || !answer) {
    return res.status(400).json({ success: false, message: "Question and answer are required." });
  }

  try {
    const cacheKey = `${FAQS_ALL_PREFIX}${user_id}`;
    const faq = await Faqs.findOne({ user: user_id });
    if (faq) {
      if (faq.faqs.some((f) => f.question === question)) {
        return res.json({ success: false, message: "FAQ already exists." });
      } else {
        const faq_data = {
          question: question,
          answer: answer,
        };
        faq.faqs.push(faq_data);
        await faq.save();
        await rabbitmqService.publishInvalidation(
          [cacheKey],
          'faqs'
        );
        return res.json({
          success: true,
          message: "FAQ added successfully.",
          faq: faq,
        });
      }
    } else {
      const faq_data = {
        user: user_id,
        faqs: [{ question, answer }],
      };
      const newFaq = await Faqs.create(faq_data);
      await rabbitmqService.publishInvalidation(
        [cacheKey],
        'faqs'
      );
      return res.json({
        success: true,
        message: "FAQs successfully created.",
        faq: newFaq,
      });
    }
  } catch (error) {
    return res.json({
      success: false,
      message: "FAQs creation unsuccessful.",
      error: error.message,
    });
  }
};

exports.fetch_faqs = async function (req, res) {
  const { username } = req.body;

  if (!username) {
    return res.json({ success: false, message: "Username is required." });
  }
  try {
    const user = await User.findOne({ username: username, });
    const user_id = user._id;
    const cacheKey = `${FAQS_ALL_PREFIX}${user_id}`;
    const cachedFaqs = await redisService.getCache(cacheKey);
    if (cachedFaqs) {
      return res.json({ success: true, faqs: cachedFaqs ,message: "FAQs fetched successfully.",});
    }
    const faqs = await Faqs.findOne({ user: user_id });
    if (!faqs) {
      return res.json({ success: false, message: "No FAQs found." });
    }
    await redisService.setCache(cacheKey, faqs.faqs, 7200);
    return res.json({
      success: true,
      message: "FAQs fetched successfully.",
      faqs: faqs.faqs,
    });
  } catch (error) {
    return res.json({
      success: false,
      message: "Failed to fetch FAQs.",
      error: error.message,
    });
  }
};
exports.delete_faq = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { id } = req.body;

  if (!user_id) {
    return res.json({ success: false, message: "User Id is required." });
  }
  try {
    const cacheKey = `${FAQS_ALL_PREFIX}${user_id}`;
    const updatedDocument = await Faqs.findOneAndUpdate(
      { user: user_id },
      { $pull: { faqs: { _id: id } } },
      { new: true }
    );

    if (!updatedDocument) {
      return res.json({
        success: false,
        message: "No FAQs found or no changes made.",
      });
    }
    await rabbitmqService.publishInvalidation(
      [cacheKey],
      'faqs'
    );

    return res.json({
      success: true,
      message: "FAQ deleted successfully.",
      faq: id,
    });
  } catch (error) {
    return res.json({
      success: false,
      message: "Failed to delete FAQs.",
      error: error.message,
    });
  }
};

exports.update_faqs_order = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { items } = req.body;
  if (!user_id) {
    return res.status(400).json({
      success: false,
      message: "User not found!",
    });
  }

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({
      success: false,
      message: "Valid items array is required!",
    });
  }

  try {
    const cacheKey = `${FAQS_ALL_PREFIX}${user_id}`;
    let existFaq = await Faqs.findOne({ user: user_id });
    if (!existFaq) {
      return res.status(404).json({
        success: false,
        message: "Faq not found!",
      });
    }
    existFaq.faqs = items;
    await existFaq.save();
    await rabbitmqService.publishInvalidation(
      [cacheKey],
      'faqs'
    );
    return res.status(200).json({
      success: true,
      message: "Updated Faqs successfully",
      faqs: existFaq,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Error updating Faqs",
      error: err.message,
    });
  }
};
exports.update_faq = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { _id, question, answer } = req.body;
  if (!user_id) {
    return res.status(400).json({
      success: false,
      message: "User not found!",
    });
  }

  if (!_id || !question || !answer) {
    return res.status(400).json({
      success: false,
      message: "FAQ ID, question and answer are required!",
    });
  }

  try {
    const cacheKey = `${FAQS_ALL_PREFIX}${user_id}`;
    const result = await Faqs.findOneAndUpdate(
      { user: user_id, "faqs._id": _id },
      {
        $set: {
          "faqs.$.question": question,
          "faqs.$.answer": answer,
        },
      },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Faq not found",
      });
    }

    const updatedFaq = result.faqs.find((c) => c._id.toString() === _id);
    await rabbitmqService.publishInvalidation([cacheKey], 'faqs');
    
    return res.status(200).json({
      success: true,
      faq: updatedFaq,
      message: "Faq updated successfully",
    });
  } catch (err) {
    console.error('Error updating FAQ:', err);
    return res.status(500).json({
      success: false,
      message: "Error updating Faq",
      error: err.message,
    });
  }
};
