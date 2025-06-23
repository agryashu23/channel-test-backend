'use strict';
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var SavedCurationSchema =  new Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required:true
    },
    curations : [{
        type:mongoose.Schema.Types.ObjectId,
        ref: 'Curation',
        required:true,
    }],
});

module.exports = mongoose.model('SavedCuration',SavedCurationSchema)