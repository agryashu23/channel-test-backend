const emailTransporter = require('./transporter');
const ejs = require('ejs');
const path = require('path');


const sendWelcomeEmail = async (to, name, username) => {
    try {
        const emailTemplate = await ejs.renderFile(
            path.join(__dirname, 'welcomeTemplate.ejs'),
            { name , username}
        );

        const mailOptions = {
            from: '"Chips.social" <' + process.env.SMTP_FROM_EMAIL + '>',
            to: to,
            subject: 'Welcome to Chips!',
            html: emailTemplate,
        };

        emailTransporter.sendMail(mailOptions, (err, data) => {
            if (err) {
                console.log(err);
                res.json({
                    status: 'fail',
                })
            } else {
                res.json({
                    status: 'success',
                })
            }
        });
    } catch (error) {
        console.error('Error rendering email template:', error);
        return { status: 'fail' };
    }
};


module.exports = sendWelcomeEmail;
