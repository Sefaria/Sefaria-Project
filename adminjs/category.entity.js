const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema(
  {
    path: { type: [String], required: true },
  },
  { timestamps: true,
  collection: 'category'},
);

const Category = mongoose.model('category', CategorySchema, 'category');

module.exports = {
  Category: Category,
  CategorySchema: CategorySchema
};