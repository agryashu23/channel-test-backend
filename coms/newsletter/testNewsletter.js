// const awsTransporter = require("./awstransporter");
// const ejs = require("ejs");
// const path = require("path");

// const sendTestNewsletter = async (description, image, links,chips,curations email) => {
//   try {
//     const emailTemplate = await ejs.renderFile(
//       path.join(__dirname, "newsletter.ejs"),
//       { description, image, links, email }
//     );
//     const mailOptions = {
//       from: '"Chips.social" <' + process.env.SMTP_FROM_EMAIL + ">",
//       to: email,
//       subject: "Newsletter",
//       html: emailTemplate,
//     };
//     awsTransporter.sendMail(mailOptions, (err, data) => {
//       if (err) {
//         console.log(err);
//         res.json({
//           status: "fail",
//         });
//       } else {
//         res.json({
//           status: "success",
//         });
//       }
//     });
//   } catch (error) {
//     console.error("Error rendering email template:", error);
//     return { status: "fail" };
//   }
// };

// module.exports = sendTestNewsletter;
