import { model, Schema, Types } from 'mongoose'

export interface ICategory {
  title: string;
}

export const CategorySchema = new Schema<ICategory>(
  {
    title: { type: 'String', required: true },
  },
  { timestamps: true },
)

export const Category = model<ICategory>('Category', CategorySchema);