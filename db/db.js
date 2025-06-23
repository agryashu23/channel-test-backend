require("dotenv").config();
const mongoose = require("mongoose");

const uri = process.env.DB_URI;

async function connect() {
  try {
    await mongoose.connect(uri);
    console.log("DataBase Connected");
  } catch (error) {
    console.log(error);
  }
}

connect();

//Models
const user = require("./models/user");
const curation = require("./models/curation");
const chip = require("./models/chip");
const savedCuration = require("./models/savedCuration");
const savedChip = require("./models/savedChip");
const waitlist = require("./models/waitlist");
const query = require("./models/query");
const admin = require("./models/admin");
const commentChip = require("./models/commentChip");
const newsletter = require("./models/newsletter");
const segment = require("./models/segment");
const Topic = require("./models/topic");
const invite = require("./models/invite");
const channel = require("./models/channel");
const channelChat = require("./models/ChannelChat");
const faqs = require("./models/faqs");
const event = require("./models/event");
const business = require("./models/business");
const dmchat = require("./models/dmChat");
const dmroom = require("./models/dmRoom");
const summary = require("./models/summary");
const poll = require("./models/poll");
const payment = require("./models/payment");
const transaction = require("./models/transaction");
const plan = require("./models/plan");
const channelMembership = require("./models/channelMembership");
const topicMembership = require("./models/topicMembership");
