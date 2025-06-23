require("dotenv").config();

const nodemailer = require("nodemailer");

const transport = {
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_FROM_EMAIL,
    pass: process.env.SMTP_TO_PASSWORD,
  },
};

const emailTransporter = nodemailer.createTransport(transport);

emailTransporter.verify((error, success) => {
  if (error) {
    console.error(error);
  } else {
    console.log("Ready to send mail!");
  }
});

module.exports = emailTransporter;
