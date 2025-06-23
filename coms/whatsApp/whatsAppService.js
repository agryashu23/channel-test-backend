const axios = require("axios");

const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

function formatPhoneNumber(phone) {
  let cleanedNumber = phone.replace(/-/g, "").trim();
  if (!cleanedNumber.startsWith("+")) {
    cleanedNumber = "+91" + cleanedNumber;
  }
  return cleanedNumber;
}

async function sendWhatsAppNotification(
  phone,
  { name, username, channelId, topicId, channelName, logoUrl }
) {
  const formattedPhone = formatPhoneNumber(phone);
  const deepLink = `user/${username}/channel/${channelId}/c-id/topic/${topicId}`;
  console.log(
    phone + name + username + channelId + topicId + channelName + logoUrl
  );
  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "template",
        template: {
          name: "chat_notification_template",
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: name },
                { type: "text", text: channelName },
              ],
            },
            {
              type: "button",
              sub_type: "url",
              index: 0,
              parameters: [{ type: "text", text: deepLink }],
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("WhatsApp message sent:", response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.log(
      "Error sending WhatsApp message:",
      error.response?.data || error.message
    );
    return { success: false, error: error.response?.data || error.message };
  }
}

module.exports = sendWhatsAppNotification;
