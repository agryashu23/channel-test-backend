const mongoose = require("mongoose");

const planSchema = new mongoose.Schema({
  _id: String,
  name: String,
  pricing: {
    monthly: {
      price: Number,
      intialFee: Number,
      currency: String,
    },
    annually: {
      price: Number,
      intialFee: Number,
      currency: String,
    },
  },
  description: String,
  buttonText: String,
  isPayAsYouGo: Boolean,
  featureRates: {
    channel: Number,
    newsletter: Number,
    userPer100: Number,
  },
  features: {
    maxChannels: Number,
    maxTopics: Number,
    newslettersPerMonth: Number,
    autoLogin: Boolean,
    analyticTitle: String,
    badge: String,
    analytics: {
      totalUsers: {
        enabled: Boolean,
        label: String,
      },
      totalChats: { enabled: Boolean, label: String },
      activeUsers: { enabled: Boolean, label: String },
      newJoiningChart: { enabled: Boolean, label: String },
      userInteractionChart: { enabled: Boolean, label: String },
      mostActiveTopic: { enabled: Boolean, label: String },
      mostActiveUsers: { enabled: Boolean, label: String },
      topicWithLeastActivity: { enabled: Boolean, label: String },
      unseenInvitesOrInactiveJoins: { enabled: Boolean, label: String },
      mediaSharedCount: { enabled: Boolean, label: String },
      pollsInteraction: { enabled: Boolean, label: String },
      channelsInteraction: { enabled: Boolean, label: String },
      channelsJoining: { enabled: Boolean, label: String },
    },
    paidEvents: Boolean,
    integrationSupport: Boolean,
    communityManager: Boolean,
    inAppNotifications: Boolean,
    userLimit: Number,
  },
  addonPricing: {
    whatsappNotifications: {
      marketing: Number,
      utility: Number,
    },
    chatSummary: {
      per1000Words: Number,
    },
  },
});

module.exports = mongoose.model("Plan", planSchema);
