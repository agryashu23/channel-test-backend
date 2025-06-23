require("dotenv").config();
var mongoose = require("mongoose");
var Newsletter = mongoose.model("Newsletter");
var Chip = mongoose.model("Chip");
var Curation = mongoose.model("Curation");
var User = mongoose.model("User");
const sendNewsletter = require("../../coms/newsletter/sendNewsletter");
const { uploadSingleImage } = require("../aws/uploads/Images");

const test_limit = 5;

const formatDate = (dateString) => {
  const options = { day: "2-digit", month: "short" }; // Example: 10 Oct
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", options);
};
const extractTime = (dateString) => {
  const options = { hour: "numeric", minute: "numeric", hour12: true }; // Example: 4:00 pm
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", options);
};
exports.test_newsletter = async function (req, res, next) {
  const user_id = res.locals.verified_user_id;
  const { description, image, items, email } = req.body;
  const currentMonth = 9;
  const currentYear = new Date().getFullYear();
  let imageUrl = null;
  let parsedItems = [];
  if (items) {
    parsedItems = JSON.parse(items);
  }
  if (parsedItems.length === 0) {
    return res.json({
      success: false,
      message: `At least one content needs to be added!`,
    });
  }
  try {
    const user = await User.findById(user_id);
    const username = user.username;
    const name = user.name;
    const logo = user.logo;
    let chips = [];
    let curations = [];
    await Promise.all(
      parsedItems.map(async (item) => {
        const { id, type } = item;
        if (type === "chip") {
          const url = `https://chips.social/profile/${username}/chip/${id}`;
          const chip = await Chip.findById(id).select(
            "text link location date metaLink"
          );
          if (chip) {
            const chipData = { ...chip.toObject(), url };
            if (chip.date && chip.date.date) {
              chipData.formattedDate = formatDate(chip.date.date);
            }
            if (chip.date && chip.date.start_time) {
              chipData.format_start_time = extractTime(chip.date.start_time);
            }
            if (chip.date && chip.date.end_time) {
              chipData.format_end_time = extractTime(chip.date.end_time);
            }
            chips.push(chipData);
          }
        } else if (type === "curation") {
          const url = `https://chips.social/profile/${username}/curation/${id}`;
          const curation = await Curation.findById(id).select(
            "name description image"
          );
          if (curation) {
            curations.push({ ...curation.toObject(), url });
          }
        }
      })
    );
    let letter = await Newsletter.findOne({
      user_id: user_id,
      month: currentMonth,
      year: currentYear,
      testing: true,
    });
    if (letter) {
      if (letter.tested_times + 1 <= test_limit) {
        letter.tested_times += 1;
        if (req.file) {
          imageUrl = await uploadSingleImage(req.file, "newsletter");
        } else if (image) {
          imageUrl = image;
        }

        await sendNewsletter(
          username,
          name,
          description,
          imageUrl,
          chips,
          curations,
          email,
          logo
        );

        await letter.save();

        return res.json({
          success: true,
          testing_times: letter.tested_times,
          message: "Test Newsletter sent successfully.",
        });
      } else {
        return res.json({
          success: false,
          testing_times: letter.tested_times,
          message: `Test limit of ${test_limit} reached. No more test emails allowed.`,
        });
      }
    } else {
      const newsletterData = {
        user_id: user_id,
        tested_times: 1,
        month: currentMonth,
        testing: true,
        year: currentYear,
      };
      if (req.file) {
        imageUrl = await uploadSingleImage(req.file, "newsletter");
      } else if (image) {
        imageUrl = image;
      }

      await sendNewsletter(
        username,
        name,
        description,
        imageUrl,
        chips,
        curations,
        email,
        logo
      );
      await Newsletter.create(newsletterData);

      return res.json({
        success: true,
        testing_times: 1,
        message: "New test newsletter created and sent successfully.",
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "An error occurred while sending the newsletter.",
      error: error.message,
    });
  }
};

exports.send_newsletter = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const { description, image, items } = req.body;
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  let imageUrl = null;
  let parsedItems = [];
  if (items) {
    parsedItems = JSON.parse(items);
  }
  if (parsedItems.length === 0) {
    return res.json({
      success: false,
      message: `At least one content needs to be added!`,
    });
  }
  try {
    const user = await User.findById(user_id).populate( "email");
    const username = user.username;
    const name = user.name;
    const logo = user.logo;
    const subscriberEmails = user.subscribers.map(
      (subscriber) => subscriber.email
    );
    if (subscriberEmails.length === 0) {
      return res.status(200).json({
        success: false,
        message: "No subscribers found!",
      });
    }
    let chips = [];
    let curations = [];
    await Promise.all(
      parsedItems.map(async (item) => {
        const { id, type } = item;
        if (type === "chip") {
          const url = `https://chips.social/profile/${username}/chip/${id}`;
          const chip = await Chip.findById(id).select(
            "text link location date metaLink"
          );
          if (chip) {
            const chipData = { ...chip.toObject(), url };
            if (chip.date && chip.date.date) {
              chipData.formattedDate = formatDate(chip.date.date);
            }
            if (chip.date && chip.date.start_time) {
              chipData.format_start_time = extractTime(chip.date.start_time);
            }
            if (chip.date && chip.date.end_time) {
              chipData.format_end_time = extractTime(chip.date.end_time);
            }
            chips.push(chipData);
          }
        } else if (type === "curation") {
          const url = `https://chips.social/profile/${username}/curation/${id}`;
          const curation = await Curation.findById(id).select(
            "name description image"
          );
          if (curation) {
            curations.push({ ...curation.toObject(), url });
          }
        }
      })
    );
    let letter = await Newsletter.findOne({
      user_id: user_id,
      month: currentMonth,
      testing: false,
      year: currentYear,
    });
    if (letter) {
      res.json({
        success: false,
        message: "Month's Newsletter already sent.",
      });
    } else {
      if (req.file) {
        imageUrl = await uploadSingleImage(req.file, "newsletter");
      } else if (image) {
        imageUrl = image;
      }
      await Promise.all(
        subscriberEmails.map(async (email) => {
          await sendNewsletter(
            username,
            name,
            description,
            imageUrl,
            chips,
            curations,
            email,
            logo
          );
        })
      );
      const newsletterData = {
        user_id: user_id,
        month: currentMonth,
        sent: true,
        testing: false,
        description: description,
        image: imageUrl,
        items: parsedItems,
        year: currentYear,
      };
      const newLetter = await Newsletter.create(newsletterData);
      res.json({
        success: true,
        message: "New test newsletter created and sent successfully.",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "An error occurred while sending the newsletter.",
      error: error.message,
    });
  }
};

exports.get_test_newsletter_limit = async function (req, res) {
  const user_id = res.locals.verified_user_id;
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const letter = await Newsletter.findOne({
    user_id: user_id,
    month: currentMonth,
    year: currentYear,
  });
  if (letter) {
    res.json({
      success: true,
      tested_times: letter.tested_times,
      message: "New test newsletter created and sent successfully.",
    });
  } else {
    res.json({
      success: true,
      tested_times: 0,
      message: "New test newsletter created and sent successfully.",
    });
  }
};

exports.get_newsletter_limit = async function (req, res) {
  try {
    const user_id = res.locals.verified_user_id;
    // const { user_id } = req.body;
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const letters = await Newsletter.find({
      user_id: user_id,
      testing: false,
      sent: true,
      year: { $gte: 2024 },
      $or: [{ year: 2024, month: { $gte: 10 } }, { year: { $gt: 2024 } }],
    });

    const getMonthName = (month) => {
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      return months[month - 1];
    };

    let records = [];
    let year = 2024;
    let month = 10;
    let count = 0;
    if (letters.length === 0) {
      records.push({
        month: getMonthName(currentMonth) + " " + currentYear,
        sent: 0,
      });
    } else {
      while (
        (year < currentYear ||
          (year === currentYear && month <= currentMonth)) &&
        count < 5
      ) {
        let found = letters.find(
          (letter) => letter.month === month && letter.year === year
        );
        records.push({
          month: getMonthName(month) + " " + year,
          sent: found ? 1 : 0,
        });
        month++;
        if (month > 12) {
          month = 1;
          year++;
        }
        count++;
      }
    }
    records.reverse();
    res.json({
      success: true,
      records: records,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching newsletters",
      error: error.message,
    });
  }
};
