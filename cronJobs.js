const cron = require("node-cron");
const mongoose = require("mongoose");
const Payment = mongoose.model("Payment");
const Business = mongoose.model("Business");
const Channel = mongoose.model("Channel");
const Topic = mongoose.model("Topic");
const ChannelChat = mongoose.model("ChannelChat");
const { summarizeChat } = require("./utils/summaryhelper");
const { generate_daily_summary } = require("./api/controllers/SummaryController");

//  cron.schedule("0 0 * * *", async () => {
//    const now = new Date();
//    await Payment.updateMany(
//      {
//        expiresAt: { $lte: new Date(now.toDateString()) }, 
//        isActive: true,
//      },
//      { isActive: false }
//    );
//    console.log("Expired payments deactivated.");
//  });

//  function getTimeWindow(currentDate, margin = 5) {
//   const date = new Date(currentDate);
//   const lower = new Date(date);
//   lower.setMinutes(date.getMinutes() - margin);

//   const upper = new Date(date);
//   upper.setMinutes(date.getMinutes() + margin);

//   return [
//     lower.toTimeString().slice(0, 5),
//     upper.toTimeString().slice(0, 5),
//   ]; 
// }




//  cron.schedule("*/10 * * * *", async () => {
//   try {
//     const now = new Date();
//     const [lower, upper] = getTimeWindow(now, 10);

//     const topics = await Topic.find({
//       summaryEnabled: true,
//       summaryType: "auto",
//       summaryTime: { $gte: lower, $lte: upper },
//     });
//     for (const topic of topics) {
//       await generate_daily_summary(topic);
//     }
//   } catch (err) {
//     console.error("❌ Auto summary cron error:", err);
//   }
// });



// cron.schedule("0 0 * * *", async () => {
//   try {
//     const cutoffDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

//     const [deleteResult, updateResult] = await Promise.all([
//       Business.deleteMany({
//         isVerified: false,
//         current_subscription: null,
//         createdAt: { $lt: cutoffDate },
//       }),
//       Business.updateMany(
//         {
//           isVerified: false,
//           current_subscription: { $ne: null },
//           createdAt: { $lt: cutoffDate },
//         },
//         {
//           $set: {
//             domain: "",
//             verificationToken: "",
//             provider: "",
//             type: "community",
//           },
//         }
//       ),
//     ]);
//     console.log(`[CRON] Deleted: ${deleteResult.deletedCount}, Updated: ${updateResult.modifiedCount}`);
//   } catch (error) {
//     console.error("[CRON ERROR]", error);
//   }
// });
