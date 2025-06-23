require("dotenv").config();
const https = require("https");

function sendViaNetcore(to, subject, content) {
  return new Promise((resolve, reject) => {
    const options = {
      method: "POST",
      hostname: "emailapi.netcorecloud.net",
      path: "/v5/mail/send",
      headers: {
        api_key: process.env.NETCORE_API_KEY,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let chunks = [];

      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        const parsed = JSON.parse(body);
        if (res.statusCode === 200) {
          resolve(parsed);
        } else {
          reject(parsed);
        }
      });
    });

    req.on("error", (e) => reject(e));

    const data = {
      from: {
        email: process.env.SMTP_NETCORE,
        name: "Channels.social",
      },
      subject,
      content,
      personalizations: [
        {
          to: [{ email: to }],
        },
      ],
    };

    req.write(JSON.stringify(data));
    req.end();
  });
}

module.exports = sendViaNetcore;
