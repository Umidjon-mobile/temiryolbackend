import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

const nodeSchema = new Schema(
  {
    _id: { type: String, required: true }, // masalan "rju-toshkent"
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    icon: { type: String, default: 'LayoutGrid' },
  },
  {
    timestamps: true,
    collection: 'nodes',
  },
);

export type NodeDoc = HydratedDocument<InferSchemaType<typeof nodeSchema>>;
export const NodeModel = model('Node', nodeSchema);
