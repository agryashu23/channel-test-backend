const awsTransporter = require("./awstransporter");
const ejs = require("ejs");
const path = require("path");

const sendNewsletter = async (
  username,
  name,
  description,
  imageUrl,
  chips,
  curations,
  email,
  logo
) => {
  try {
    const emailTemplate = await ejs.renderFile(
      path.join(__dirname, "newsletter.ejs"),
      { username, name, description, imageUrl, chips, curations, email, logo }
    );

    const mailOptions = {
      from: `${username} <${process.env.SMTP_FROM_EMAIL}>`,
      to: email,
      subject: "Newsletter",
      html: emailTemplate,
    };

    return new Promise((resolve, reject) => {
      awsTransporter.sendMail(mailOptions, (err, data) => {
        if (err) {
          console.log(err);
          reject("fail");
        } else {
          resolve("success");
        }
      });
    });
  } catch (error) {
    console.error("Error rendering email template:", error);
    throw new Error("fail");
  }
};

module.exports = sendNewsletter;
