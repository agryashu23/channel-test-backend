// "use strict";
// const mongoose = require("mongoose");
// const Schema = mongoose.Schema;

// const BusinessMembershipSchema = new mongoose.Schema({
//     user_id: { type: mongoose.Schema.Types.ObjectId, 
//         ref: 'User', 
//         unique:true,
//         required: true
//      },
//     business: { 
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Business', 
//         required: true 
//     },
//     role: {
//       type: String,
//       enum: ['owner', 'admin', 'moderator'],
//       required: true,
//       default:"owner"
//     }
//   }, { timestamps: true });

// module.exports = mongoose.model("BusinessMembership", BusinessMembershipSchema);
  