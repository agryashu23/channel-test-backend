// "use strict";
// const mongoose = require("mongoose");
// const Schema = mongoose.Schema;

// const InviteMembersSchema = new Schema(
//   {
//     business: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Business",
//       default: null,
//       required: true,
//     },
//     email: {
//       type: String,
//       required: true,
//     },
//     channelId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Channel",
//       required: true,
//     },
//     topicId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Topic",
//       required: false,
//     },
//     channelRole: {
//       type: String,
//       enum: ["admin", "editor", "member"],
//       default: "member",
//     },
//     topicRole: {
//       type: String,
//       enum: ["admin", "editor", "member"],
//       default: "member",
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// module.exports = mongoose.model("InviteMembers", InviteMembersSchema);
