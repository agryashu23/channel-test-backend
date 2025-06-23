"use strict";
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

const DMRoomSchema = new Schema(
  {
    users: [{ type: Schema.Types.ObjectId, ref: "User" }],
    lastMessage: { type: Schema.Types.ObjectId, ref: "DMChat" },
    archived:{
      type:Boolean,
      default:false,
    },
    blocked:{
      type:Boolean,
      default:false,
    },
    lastSeen: {
      type: Map,
      of: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DMRoom", DMRoomSchema);
