const emailTransporter = require("../channelRequest/channelTransporter");
const ejs = require("ejs");
const path = require("path");

const sendAcceptChannelRequest = async (
  to,
  channelId,
  channelName,
  username,
  logo
) => {
  try {
    const emailTemplate = await ejs.renderFile(
      path.join(__dirname, "acceptChannelRequest.ejs"),
      { channelId, channelName, username, logo }
    );

    const mailOptions = {
      from: `Channels.social <${process.env.SMTP_FROM_EMAIL}>`,
      to: to,
      subject: `${channelName} channel confirmation!`,
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
