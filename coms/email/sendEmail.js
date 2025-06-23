// const emailTransporter = require("./transporter");

// function sendEmail(to, subject, message) {
//   if (to && subject && message) {
//     const mail = {
//       from: '"Channels.social" <' + process.env.SMTP_FROM_EMAIL + ">",
//       to: to,
//       subject: subject,
//       text: message,
//     };

//     emailTransporter.sendMail(mail, (err, data) => {
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
//   } else {
//     res.json({ status: "fail", message: "missing values" });
//   }
// }

// module.exports = sendEmail;

const sendViaNetcore = require("./netcoreTransporter");
const ejs = require("ejs");
const path = require("path");

async function sendEmail(to, subject, message, res) {
  if (!to || !subject || !message) {
    return console.error("NO data");
  }

  try {
    const content = [{ type: "html", value: `<p>${message}</p>` }];

    return await sendViaNetcore(to, subject, content);

    // res.json({ status: "success" });
  } catch (err) {
    console.error(err);
    // res.json({ status: "fail", message: err.message });
  }
}

module.exports = sendEmail;
