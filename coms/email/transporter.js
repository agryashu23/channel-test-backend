require('dotenv').config()

const nodemailer = require('nodemailer');

const transport = {
    host: 'smtp.gmail.com',
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
        //if error happened code ends here
        console.error(error)
    } else {
        //this means success
        console.log('Ready to send mail!')
    }
});

module.exports = emailTransporter;