var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var SavedChipSchema = new Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  chip_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Chip",
  },
});

module.exports = mongoose.model("SavedChip", SavedChipSchema);
