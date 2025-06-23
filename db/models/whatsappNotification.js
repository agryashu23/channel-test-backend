const WhatsappNotificationSchema = new Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Business",
    required: true,
  },
  topic: { type: mongoose.Schema.Types.ObjectId, ref: "Topic" },
  chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat" },
  mode: {
    type: String,
    enum: ["admin_message", "inactivity", "trigger"],
    required: true,
  },
  template: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "WhatsappTemplate",
    required: true,
  },
  content: { type: String },
  imageUrl: { type: String },
  link: { type: String },
  sentTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  sentCount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ["pending", "sent", "failed"],
    default: "pending",
  },
  type: {
    type: String,
    enum: ["utility", "marketing"],
    required: true,
  },
  scheduledFor: Date,
  createdAt: { type: Date, default: Date.now },
});
