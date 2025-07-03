const emailTransporter = require("../channelRequest/channelTransporter");
const ejs = require("ejs");
const path = require("path");

const sendAcceptChannelRequest = async (
  to,
  channelId,
  channelName,
  username,
  logo,
  topicId,
  topicName,
  eventId,
  eventName
) => {
  try {
    const emailTemplate = await ejs.renderFile(
      path.join(__dirname, eventId!=="" ? "acceptEventRequest.ejs" : topicId!=="" ? "acceptTopicRequest.ejs" : "acceptChannelRequest.ejs"),
      { channelId, channelName, username, logo,topicId,topicName,eventId,eventName }
    );

    const mailOptions = {
      from: `Channels.social <${process.env.SMTP_FROM_EMAIL}>`,
      to: to,
      subject: `${eventId!=="" ? eventName + " event " : topicId!=="" ? topicName+" in "+channelName : channelName} request accepted!`,
      html: emailTemplate,
    };

    return new Promise((resolve, reject) => {
      emailTransporter.sendMail(mailOptions, (err, data) => {
        if (err) {
          console.error("Error sending email:", err);
          reject({ status: "fail", error: err });
        } else {
          resolve({ status: "success" });
        }
      });
    });
  } catch (error) {
    console.error("Error rendering email template:", error);
    return { status: "fail", error };
  }
};

module.exports = sendAcceptChannelRequest;
