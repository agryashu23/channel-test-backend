require("dotenv").config();
const nodemailer = require("nodemailer");
const AWS = require("aws-sdk");

const transport = {
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_FROM_EMAIL,
    pass: process.env.SMTP_TO_PASSWORD,
  },
};
const awsTransporter = nodemailer.createTransport(transport);

awsTransporter.verify((error, success) => {
  if (error) {
    console.error(error);
  } else {
    console.log("Ready to send mail!");
  }
});

module.exports = awsTransporter;
