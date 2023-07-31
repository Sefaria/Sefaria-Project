const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema(
  {
    title: { type: 'String', required: true },
  },
  { timestamps: true },
);

const Category = mongoose.model('Category', CategorySchema);

module.exports = {
  Category: Category,
  CategorySchema: CategorySchema
};