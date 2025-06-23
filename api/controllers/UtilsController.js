require("dotenv").config();
var mongoose = require("mongoose");
var axios = require("axios");
var User = mongoose.model("User");
var Waitlist = mongoose.model("Waitlist");
var axios = require("axios");


exports.join_waitlist = async function (req, res) {
  const { email } = req.body;
  try {
    const waiting = await Waitlist.findOne({ email: email });
    if (waiting) {
      res.json({
        success: false,
        message: "Joined already! Will be launching soon.",
      });
    } else {
      const wait = await Waitlist.create({ email: email });
      res.json({
        success: true,
        message: "Hurray! You are on waitlist.",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "An error occurred while joining the waitlist.",
      error: error.message,
    });
  }
};

exports.profile_username = async function (req, res) {
  const username = req.params.username;

  if (!username) {
    return res
      .status(400)
      .json({ success: false, message: "Username is required." });
  }
  try {
    const user = await User.findOne({ username: username }).select(
      "name username description logo"
    );
    if (user) {
      return res.status(200).json({ success: true, user: user });
    } else {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }
  } catch (error) {
    console.error("Failed to fetch profile:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch profile." });
  }
};

exports.channel_unsplash = async function (req, res) {
  const keyword = req.query.keyword;
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
    keyword
  )}&client_id=${process.env.UNSPLASH_ACCESS_KEY}`;
  try {
    const response = await axios.get(url);
    const data = response.data;

    if (data && data.results) {
      const photos = data.results.map((photo) => ({
        id: photo.id,
        name: photo.description || keyword,
        url: photo.urls.regular,
      }));
      res.status(200).json({ success: true, data: photos });
    } else {
      res.status(404).json({ success: false, message: "No results found." });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// exports.whatsapp_test = async function (req, res) {
//   try {
//     const { phone, message, header, footer } = req.body;

//     if (!phone || !message) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Phone and message are required" });
//     }

//     const data = JSON.stringify({
//       token: process.env.LEMINI_TOKEN,
//       phone: phone,
//       message: message,
//       header: header || "Hello there",
//       // footer: footer || "Thanks",
//     });

//     const config = {
//       method: "post",
//       maxBodyLength: Infinity,
//       url: "https://chat.leminai.com/api/wpbox/sendmessage",
//       headers: {
//         Authorization: `Bearer ${process.env.LEMINI_TOKEN}`,
//         "Content-Type": "application/json",
//       },
//       data: data,
//     };

//     const response = await axios(config);

//     res.status(200).json({
//       success: true,
//       data: response.data,
//     });
//   } catch (error) {
//     console.error("Error sending WhatsApp message:", error.message);

//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// };

exports.whatsapp_test = async function (req, res) {
  try {
    const { phone, topic_name, username, channel_id, topic_id } = req.body;

    if (!phone || !topic_name || !username || !channel_id || !topic_id) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters",
      });
    }

    const data = {
      token: process.env.LEMINI_TOKEN,
      phone: phone,
      template_name: "topic_message",
      template_language: "en",
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: topic_name }],
        },
        {
          type: "button",
          sub_type: "url",
          index: 0,
          parameters: [
            { type: "text", text: username },
            { type: "text", text: channel_id },
            { type: "text", text: topic_id },
          ],
        },
      ],
    };
    console.log(
      "Sending WhatsApp message with data:",
      JSON.stringify(data, null, 2)
    );

    const config = {
      method: "post",
      maxBodyLength: Infinity,
      url: "https://chat.leminai.com/api/wpbox/sendtemplatemessage",
      headers: {
        Authorization: `Bearer ${process.env.LEMINI_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: JSON.stringify(data),
    };

    const response = await axios(config);

    res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error("Error sending WhatsApp message:", error.message);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.places_autocomplete = async function (req, res) {
  const input = req.query.input;
  const apiKey = process.env.MAPS_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
    input
  )}&key=${apiKey}`;

  try {
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

async function getGeocode(latitude, longitude) {
  const apiKey = process.env.MAPS_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`;

  try {
    const response = await axios.get(url);
    if (response.data.status === "OK") {
      const address = response.data.results[0].formatted_address;
      return address;
    } else {
      return "Address not found";
    }
  } catch (error) {
    console.error("Error fetching geocoding data:", error);
    return "Error fetching address";
  }
}
exports.send_whatsapp = async function (req, res) {
  const { phone, name, channelId, topicId, channelName, username } = req.body;

  if (!phone || !channelId || !topicId || !channelName) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  const result = await sendWhatsAppNotification(phone, {
    name,
    username,
    channelId,
    topicId,
    channelName,
  });
  if (result.success) {
    res.status(200).json({ message: "Notification sent!", data: result.data });
  } else {
    res
      .status(500)
      .json({ error: "Failed to send notification", details: result.error });
  }
};

exports.getAddress = async function (req, res) {
  const { latitude, longitude } = req.query;
  const address = await getGeocode(latitude, longitude);
  res.json({ address });
};


