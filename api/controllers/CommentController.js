require("dotenv").config();
var mongoose = require("mongoose");
var CommentChip = mongoose.model("CommentChip");
var Chip = mongoose.model("Chip");
const rabbitmqService = require('../services/rabbitmqService');
const redisService = require('../services/redisService');

const COMMENT_PREFIX = "comment:";

const SEGMENT_ALL_PREFIX = 'segments:all:';

const CHIP_PREFIX = 'chip:';
const CHIPS_CURATION_PREFIX = 'chips:curation:';

exports.create_chip_comment = async function (req, res, next) {
  const { chipId, comment } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
   
    const comment_data = {
      user: user_id,
      chipId: chipId,
      comment: comment,
    };
    let newComment = await CommentChip.create(comment_data);
    if (!newComment) {
      return res.json({ success: false, message: "Error in creating comment" });
    }
    const chip = await Chip.findById(chipId);
    const cacheKey = `${COMMENT_PREFIX}${chipId}`;
    const chipCacheKey = `${CHIP_PREFIX}${chipId}`;
    const segmentCacheKey = `${SEGMENT_ALL_PREFIX}${chip.user}`;
    const curationCacheKey = `${CHIPS_CURATION_PREFIX}${chip.curation}`;
    if (chip) {
      if (chip.comments === undefined || chip.comments === null) {
        chip.comments = 1;
      } else {
        chip.comments += 1;
      }
    }
    await chip.save();

    newComment = await CommentChip.findById(newComment._id)
      .populate("user", { username: 1, name: 1, email: 1, logo: 1 })
      .exec();
    newComment = newComment.toObject();
    newComment.profile_category = chip.profile_category || "";
    await rabbitmqService.publishInvalidation([cacheKey, chipCacheKey, segmentCacheKey, curationCacheKey],'comment');
    res.json({
      success: true,
      message: "Comment created successfully",
      comment: {
        ...newComment,
        profile_category:chip.profile_category || ""
      }
    });
  } catch (error) {
    console.error("Error creating comment:", error);
    res.json({ success: false, message: "Error creating comment" });
  }
};

exports.toggle_comment_upvote = async function (req, res, next) {
  const { id } = req.body;
  const user_id = res.locals.verified_user_id;
  try {
    const comment = await CommentChip.findById(id);
    const cacheKey = `${COMMENT_PREFIX}${comment.chipId}`;
    let comm_ind = comment.upvotes.indexOf(user_id);
      if (comm_ind !== -1) {
        comment.upvotes.splice(comm_ind, 1);
        comment.save();
        await rabbitmqService.publishInvalidation([cacheKey],'comment');
        res.json({
          success: true,
          message: "Downvoted comment",
          comment: comment,
        });
      } else {
        comment.upvotes.push(user_id);
        comment.save();
        await rabbitmqService.publishInvalidation([cacheKey],'comment');
        res.json({
          success: true,
          message: "Upvoted comment",
          comment: comment,
        });
      }
  } catch (error) {
    res.json({ success: false, message: "Error while performing upvote" });
  }
};

exports.toggle_comment_reply_upvote = async function (req, res, next) {
  const { commentId, replyId } = req.body;
  const user_id = res.locals.verified_user_id;
  try {
    const comment = await CommentChip.findById(commentId);
    const cacheKey = `${COMMENT_PREFIX}${comment.chipId}`;
    if (!comment) {
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });
    }
    const reply = comment.replies.id(replyId);
    if (!reply) {
      return res
        .status(404)
        .json({ success: false, message: "Reply not found" });
    }
    const replyIndex = reply.upvotes.indexOf(user_id);
    if (replyIndex !== -1) {
      reply.upvotes.splice(replyIndex, 1);
      await comment.save();
      await rabbitmqService.publishInvalidation([cacheKey],'comment');
      return res.json({
        success: true,
        message: "Downvoted comment reply",
        reply: reply,
      });
    } else {
      reply.upvotes.push(user_id);
      await comment.save();
      return res.json({
        success: true,
        message: "Upvoted comment reply",
        reply: reply,
      });
    }
  } catch (error) {
    console.error("Error while toggling upvote:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error while performing upvote" });
  }
};

exports.create_chip_comment_reply = async function (req, res, next) {
  const { id, comment, repliedToUserId } = req.body;
  const user_id = res.locals.verified_user_id;

  try {
    const commentDoc = await CommentChip.findById(id);
    if (!commentDoc) {
      return res.json({ success: false, message: "Comment not found" });
    }

    const newReply = {
      user: user_id,
      comment: comment,
      parentCommentId: id,
      repliedToUserId: repliedToUserId,
      _id: new mongoose.Types.ObjectId(),
    };
    commentDoc.replies.push(newReply);
    await commentDoc.save();

    const chip = await Chip.findById(commentDoc.chipId);
    const cacheKey = `${COMMENT_PREFIX}${chip._id}`;
    const chipCacheKey = `${CHIP_PREFIX}${chip._id}`;
    const segmentCacheKey = `${SEGMENT_ALL_PREFIX}${chip.user}`;
    const curationCacheKey = `${CHIPS_CURATION_PREFIX}${chip.curation}`;
    
    if (chip) {
      if (chip.comments === undefined || chip.comments === null) {
        chip.comments = 1;
      } else {
        chip.comments += 1;
      }
    }
    await chip.save();

    await CommentChip.populate(commentDoc, {
      path: "replies",
      populate: [
        { path: "user", select: "username name email logo" },
        { path: "repliedToUserId", select: "_id username name" },
        {
          path: "parentCommentId",
          select: "_id chipId user comment",
          populate: { path: "user", select: "username name" },
        },
      ],
    });

    const populatedReply = commentDoc.replies.find((r) =>
      r._id.equals(newReply._id)
    );
    await rabbitmqService.publishInvalidation([cacheKey, chipCacheKey, segmentCacheKey, curationCacheKey],'comment');
    res.json({
      success: true,
      message: "Comment reply created successfully",
      reply: {
        ...populatedReply.toObject(),
        profile_category: chip.profile_category || "",
      },
    });
  } catch (error) {
    res.json({
      success: false,
      message: "Error creating comment reply",
    });
  }
};

exports.fetch_chip_comments = async function (req, res, next) {
  const { chipId } = req.body;
  try {
    const cacheKey = `${COMMENT_PREFIX}${chipId}`;
    const cachedComments = await redisService.getCache(cacheKey);
    if (cachedComments) {
      return res.json({
        success: true,
        message: "Comments fetched successfully from cache",
        comments:cachedComments
      });
    };
    
    const comments = await CommentChip.find({ chipId: chipId })
      .populate("user", { username: 1, name: 1, email: 1, logo: 1 })
      .populate({
        path: "replies.user",
        select: "username name logo",
      })
      .populate({
        path: "replies.repliedToUserId",
        select: "_id username",
      });
    if (!comments || comments.length === 0) {
      return res.json({ success: false, message: "Comments not found" });
    }
    await redisService.setCache(cacheKey, comments, 7200);
    res.json({
      success: true,
      message: "Comments fetched successfully",
      comments: comments,
    });
  } catch (error) {
    console.error("Error in fetching comments", error);
    res.json({
      success: false,
      message: "Error in fetching comments",
    });
  }
};
