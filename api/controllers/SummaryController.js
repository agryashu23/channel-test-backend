require("dotenv").config();
var mongoose = require("mongoose");
var ChannelChat = mongoose.model("ChannelChat");
var User = mongoose.model("User");
var Summary = mongoose.model("Summary");
var Business = mongoose.model("Business");
const {
  uploadSingleImage,
  uploadMultipleImages,
} = require("../aws/uploads/Images");
const { summarizeChat } = require("../../utils/summaryhelper");
const Topic = mongoose.model("Topic");

function getToday5AMWindow(currentDate = new Date()) {
  const start = new Date(currentDate);
  if (start.getHours() < 5) start.setDate(start.getDate() - 1);
  start.setHours(5, 0, 0, 0);
  return { start};
}


function formatMessages(messages) {
  return messages
    .map((msg) => {
      const time = new Date(msg.createdAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${time} - ${msg.user?.username}: ${msg.content}`;
    })
    .join("\n");
}

function getStartOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

exports.generate_summary_data = async function (req, res) {
  try {
    const { topic, startTime, endTime } = req.body;
    const user_id = res.locals.verified_user_id;

    if (!topic) {
      return res.json({
        success: false,
        message: "Topic ID is requried",
      });
    }
    if(!startTime){
      startTime = getToday5AMWindow().start;
    }
    if(!endTime){
      endTime = Date.now();
    }
    const start = new Date(startTime);
    const end = new Date(endTime);

    const business = await Business.findOne({user:user_id}).select("user_id chatSummary").lean();
    const topicData = await Topic.findById(topic).select("business summaryEnabled user").lean();
    if (!topicData || !topicData.business || !topicData.summaryEnabled || !topicData.user!==user_id || !business.chatSummary)
      return res.json({ success: false, message: "Topic not found or you are not the owner of the topic" });

    const summariesInRange = await Summary.find({
      topic,
      type: "manual",
      createdAt: { $gte: start, $lte: end },
    }).sort({ createdAt: 1 });

    const rangeMidpoint = new Date((start.getTime() + end.getTime()) / 2);
    let selectedSummary = null;
    let closestDiff = Infinity;
    let tokensUsedprevious = 0;
    for (const summary of summariesInRange) {
      const diff = Math.abs(summary.createdAt - rangeMidpoint);
      if (diff < closestDiff) {
        closestDiff = diff;
        selectedSummary = summary;
        tokensUsedprevious = summary.tokensUsed;
      }
    }
    let combinedText = "";
    let fromTime = start;

    if (selectedSummary) {
      combinedText += selectedSummary.summary + "\n\n";
      fromTime = selectedSummary.createdAt;
    }
    
    const [chatsBefore, chatsAfter] = await Promise.all([
      ChannelChat.find({ topic, createdAt: { $gte: start, $lt: fromTime } })
        .populate("user", "username")
        .sort({ createdAt: 1 }),
      ChannelChat.find({ topic, createdAt: { $gt: fromTime, $lte: end } })
        .populate("user", "username")
        .sort({ createdAt: 1 }),
    ]);

      const beforeText = formatMessages(chatsBefore);
      const afterText = formatMessages(chatsAfter);

      if (!beforeText && !afterText && selectedSummary) {
        return res.json({
          success: true,
          summary: selectedSummary.summary.replace(/\n/g, " "),
        });
      }

      if(!beforeText && !afterText && !selectedSummary){
        return res.json({
          success: true,
          summary: "No new messages to summarize",
        });
      }
      const finalInput = 
        `Previous Messages:\n${beforeText}\n\n` +
        `Previous Summary:\n${combinedText}\n\n` +
        `New Messages:\n${afterText}`;  

      let prompt = "";
      if (combinedText && beforeText && !afterText) {
        prompt = `You're a helpful assistant that updates a group chat summary. A summary has already been generated for some messages in the middle of the conversation. Now, older messages have been added.
        Generate a complete, seamless summary that includes both the older messages and the previously summarized part.
        - Use Hinglish and emojis where appropriate.
        - Reflect the tone of the conversation.
        - Avoid repeating lines from the existing summary.
        - Only include what's actually in the chat — don't make anything up.`;
        
      } 
      else if(combinedText && !beforeText && afterText){
        prompt = `You're a helpful assistant that updates a group chat summary. A summary already exists for some earlier messages. Now, newer messages have been added to the chat.
        Update the summary to include both the existing summary and the new messages. The final version should feel smooth and unified.
        - Use Hinglish and emojis where appropriate.
        - Match the tone and style of the conversation.
        - Don’t repeat lines from the existing summary.
        - Only summarize what is actually present in the chat.`;
        
      }
      else if(combinedText && beforeText && afterText){
        prompt = `You're a helpful assistant that updates a group chat summary. A summary was previously generated for a portion of the chat. Now, messages from before and after that portion have been added.
        Generate a single, cohesive summary that includes the entire conversation — old, middle, and new — in a natural, easy-to-read way.
        - Use Hinglish and emojis where appropriate.
        - Match the chat’s mood (casual, serious, funny).
        - Don’t repeat lines from the existing summary.
        - Stick to only what’s present — no made-up content.`;
        
      }
      else {
        prompt = `You're a helpful assistant that summarizes WhatsApp-style group chats. Create a short and casual summary of the conversation to help someone catch up quickly.
        - Use Hinglish and emojis if they fit the tone.
        - Reflect the overall vibe (fun, serious, chill).
        - Only summarize what was actually discussed — no guesses or assumptions.`;

      }
      const updatedSummary = await summarizeChat(finalInput, prompt);
      const newSummary = new Summary({
        summary: (updatedSummary.summary || "").replace(/\n/g, " "),
        user: user_id,
        topic,
        type: "manual",
        tokensUsed: updatedSummary.tokens.totalTokens + (tokensUsedprevious-combinedText.length>0?tokensUsedprevious-combinedText.length:0),
        startTime: start,
        endTime: end,
      });
      await newSummary.save();
      res.json({
        success: true,
        summary: (updatedSummary.summary || "").replace(/\n/g, " ")
      });
  } catch (err) {
    console.error("Summary generation error:", err);
    res.json({ success: false, message: "Server error" });
  }
};


exports.fetch_topic_summary = async function (req, res) {
  try {
    const { topic } = req.body;

    if (!topic) {
      return res
        .json({ success: false, message: "Topic ID is required" });
    }
    const summaries = await Summary.find({topic:topic,type:"manual"})
    return res.json({
      success: true,
      summary: summaries,
    });
  } catch (err) {
    console.error("Error fetching topic summary:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};



exports.generate_daily_summary = async function (topic) {
  
  try {
    const now = new Date();
    const startTime = getStartOfDay(now);
    const endTime = now;

    const exists = await Summary.findOne({
      topic: topic._id,
      type: "auto",
      startTime,
      endTime,
    });
  
    if (exists) return console.log(`⏭ Summary already exists for topic ${topic.name}`);

    const chats = await ChannelChat.find({
      topic: topic._id,
      createdAt: { $gte: startTime, $lte: endTime },
    })
      .populate("user", "username")
      .sort({ createdAt: 1 });
      if (!chats.length) return console.log(`⚠️ No chats found for topic ${topic.name}`);
    const chatText = formatMessages(chats);
    const prompt = `You're a helpful assistant that summarizes WhatsApp-style group chats. Create a short and casual summary of the conversation to help someone catch up quickly.
    - Use Hinglish and emojis if they fit the tone.
    - Reflect the overall vibe (fun, serious, chill).
    - Only summarize what was actually discussed — no guesses or assumptions.`;
    
    const result = await summarizeChat(chatText, prompt);
    await Summary.create({
      summary: result.summary.replace(/\n/g, " "),
      topic: topic._id,
      user: topic.user, 
      type: "auto",
      tokensUsed: result.tokens.totalTokens,
      startTime,
      endTime,
    });
  } catch (err) {
    console.log("Summary generation error:", err);
    
  }
};