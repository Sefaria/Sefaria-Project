const mongoose = require('mongoose');
const BookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
      authors: { type: [String]},
      enDesc: {type: String},
      heDesc: {type: String},
      enShortDesc: {type: String},
      heShortDesc: {type: String},
      pubDate: {},
      pubPlace: {type: String},
      compDate: {},
      errorMargin: {},
      era: {type: String}
  },
  { timestamps: true,
  collection: 'index'},
);

const Book = mongoose.model('index', BookSchema, 'index');

module.exports = {
  Book, BookSchema
};