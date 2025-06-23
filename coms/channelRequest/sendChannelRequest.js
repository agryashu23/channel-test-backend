const emailTransporter = require("./channelTransporter");
const ejs = require("ejs");
const path = require("path");

const sendChannelRequest = async (
  to,
  channelId,
  userId,
  channelUser,
  channelName,
  name,
  username,
  logo
) => {
  try {
    const emailTemplate = await ejs.renderFile(
      path.join(__dirname, "channelRequest.ejs"),
      { channelId, userId, channelUser, channelName, name, username, logo }
    );

    const mailOptions = {
      from: `"Channels.social" <${process.env.SMTP_FROM_EMAIL}>`,
      to: to,
      subject: `${channelName} channel join request!`,
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

module.exports = sendChannelRequest;
